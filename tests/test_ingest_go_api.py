"""Unit tests for scripts/ingest_go_api.py Metrolinx payload parsing.

Uses only the Python standard library (unittest + mocking), so the suite runs
under both `python -m unittest` and `pytest` without extra dependencies.
Mocked payloads mirror the real Metrolinx envelope shapes:

  * ServiceAlert/All -> {'Messages': {'Message': [...] / {...}}}
  * Exceptions/Train -> {'Trip': [...]}
"""

import json
import os
import sys
import unittest
from datetime import date
from unittest import mock

# ingest_go_api reads these at import time - provide stand-ins before the
# module is imported so its module-level constants resolve.
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

from scripts import ingest_go_api as ingest  # noqa: E402


class EndpointTests(unittest.TestCase):
    def test_trip_endpoint_points_at_exceptions_train(self):
        # ServiceUpdate/TripUpdates returns HTTP 404; Exceptions/Train is the
        # real JSON endpoint for trip cancellations and schedule exceptions.
        self.assertEqual(ingest.TRIP_UPDATES_ENDPOINT, "ServiceUpdate/Exceptions/Train")
        self.assertEqual(ingest.ALERTS_ENDPOINT, "ServiceUpdate/ServiceAlert/All")


class CollectionNormalizationTests(unittest.TestCase):
    def test_as_list_handles_none_scalar_and_list(self):
        self.assertEqual(ingest.as_list(None), [])
        self.assertEqual(ingest.as_list({"Code": "BR"}), [{"Code": "BR"}])
        self.assertEqual(ingest.as_list([1, 2]), [1, 2])

    def test_extract_collection_nested_message_list(self):
        payload = {"Messages": {"Message": [{"Code": "1"}, {"Code": "2"}]}}
        self.assertEqual(
            ingest.extract_collection(payload, "Messages.Message"),
            [{"Code": "1"}, {"Code": "2"}],
        )

    def test_extract_collection_nested_message_single_dict(self):
        # Metrolinx returns a plain object instead of a one-element array when
        # only one alert is active.
        payload = {"Messages": {"Message": {"Code": "1"}}}
        self.assertEqual(
            ingest.extract_collection(payload, "Messages.Message"),
            [{"Code": "1"}],
        )

    def test_extract_collection_trip_envelope_list_and_single(self):
        self.assertEqual(
            ingest.extract_collection({"Trip": [{"TripNumber": "968"}]}, "Trip"),
            [{"TripNumber": "968"}],
        )
        self.assertEqual(
            ingest.extract_collection({"Trip": {"TripNumber": "969"}}, "Trip"),
            [{"TripNumber": "969"}],
        )

    def test_extract_collection_falls_back_to_flat_keys(self):
        payload = {"ServiceAlerts": [{"Code": "1"}]}
        self.assertEqual(
            ingest.extract_collection(
                payload, "Messages.Message", fallback=("ServiceAlerts",)
            ),
            [{"Code": "1"}],
        )


class BarrieFilterTests(unittest.TestCase):
    def test_lines_code_br(self):
        self.assertTrue(ingest.is_barrie_line({"Lines": [{"Code": "BR"}]}))

    def test_lines_code_route_id_68(self):
        # GTFS route_id 68 identifies the Barrie line in Metrolinx data.
        self.assertTrue(ingest.is_barrie_line({"Lines": [{"Code": "68"}]}))

    def test_lines_single_object_shape(self):
        self.assertTrue(ingest.is_barrie_line({"Lines": {"Code": "BR"}}))

    def test_other_line_rejected(self):
        self.assertFalse(ingest.is_barrie_line({"Lines": [{"Code": "LW"}]}))
        self.assertFalse(ingest.is_barrie_line({"RouteCode": "LW"}))

    def test_trip_name_mentions_barrie(self):
        self.assertTrue(ingest.is_barrie_line({"TripName": "Barrie 968"}))
        self.assertTrue(ingest.is_barrie_line({"TripName": "BR-968"}))

    def test_trip_stop_names_classify_barrie(self):
        entity = {
            "Stop": [
                {"StopName": "Union Station GO"},
                {"StopName": "Allandale Waterfront GO"},
            ]
        }
        self.assertTrue(ingest.is_barrie_line(entity))
        # Union Station alone is shared with every other line - it must not
        # classify a Lakeshore/Kitchener trip as Barrie.
        self.assertFalse(
            ingest.is_barrie_line({"Stop": [{"StopName": "Union Station GO"}]})
        )


class MapAlertTests(unittest.TestCase):
    def test_full_metrolinx_alert_payload(self):
        alert = {
            "Code": "1234",
            "PostedDateTime": "2025-05-01T09:30:00-04:00",
            "Category": "Delay",
            "SubjectEnglish": "Barrie line delay",
            "BodyEnglish": "Train 968 is holding at Bradford.",
            "Lines": [{"Code": "BR"}],
            "startServiceDate": "2025-05-01",
            "endServiceDate": "2025-05-01",
        }
        rows = ingest.map_alert(alert)
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["alert_id"], "1234")
        self.assertEqual(row["service_date"], "2025-05-01")
        self.assertEqual(row["line_code"], "BR")
        self.assertEqual(row["status"], "Delay")
        self.assertEqual(
            row["message"], "Barrie line delay\n\nTrain 968 is holding at Bradford."
        )
        self.assertEqual(row["received_at"], "2025-05-01T13:30:00+00:00")
        self.assertEqual(json.loads(row["raw_json"])["Code"], "1234")

    def test_alert_without_posted_datetime_has_no_received_at(self):
        alert = {
            "Code": "1",
            "SubjectEnglish": "Track work",
            "Lines": [{"Code": "BR"}],
            "startServiceDate": "2025-05-01",
        }
        rows = ingest.map_alert(alert)
        self.assertEqual(len(rows), 1)
        self.assertNotIn("received_at", rows[0])
        self.assertEqual(rows[0]["message"], "Track work")

    def test_non_barrie_alert_produces_no_rows(self):
        alert = {
            "Code": "9999",
            "Lines": [{"Code": "LW"}],
            "SubjectEnglish": "Lakeshore delay",
        }
        self.assertEqual(ingest.map_alert(alert), [])

    def test_multi_day_alert_expands_service_dates(self):
        alert = {
            "Code": "555",
            "SubjectEnglish": "Track work",
            "Lines": [{"Code": "BR"}],
            "startServiceDate": "2025-08-15",
            "endServiceDate": "2025-08-17",
        }
        rows = ingest.map_alert(alert)
        self.assertEqual(
            [r["service_date"] for r in rows],
            ["2025-08-15", "2025-08-16", "2025-08-17"],
        )


class MapTripUpdateTests(unittest.TestCase):
    def test_cancelled_barrie_exception_trip(self):
        entity = {
            "TripNumber": "968",
            "TripName": "Barrie 968",
            "IsCancelled": "true",
            "Stop": [
                {
                    "StopId": "ALNW",
                    "StopName": "Allandale Waterfront",
                    "StopSequence": 1,
                    "ScheduledTime": "06:13",
                },
                {
                    "StopId": "UNION",
                    "StopName": "Union Station",
                    "StopSequence": 2,
                    "ScheduledTime": "07:29",
                },
            ],
        }
        row = ingest.map_trip_update(entity)
        self.assertIsNotNone(row)
        self.assertEqual(row["trip_id"], "968")
        self.assertEqual(row["line_code"], "BR")
        self.assertEqual(row["schedule_relationship"], "CANCELED")
        stops = json.loads(row["stop_time_updates"])
        self.assertEqual(len(stops), 2)
        self.assertEqual(stops[0]["stop_name"], "Allandale Waterfront")
        self.assertEqual(stops[0]["stop_sequence"], 1)
        self.assertEqual(stops[1]["stop_id"], "UNION")

    def test_non_cancelled_exception_trip_is_scheduled(self):
        entity = {"TripNumber": "969", "TripName": "Barrie 969", "IsCancelled": False}
        row = ingest.map_trip_update(entity)
        self.assertEqual(row["schedule_relationship"], "SCHEDULED")

    def test_non_barrie_trip_ignored(self):
        entity = {
            "TripNumber": "301",
            "TripName": "Lakeshore West 301",
            "Stop": [{"StopName": "Union Station"}],
        }
        self.assertIsNone(ingest.map_trip_update(entity))


class DateHelpersTests(unittest.TestCase):
    def test_parse_service_date_is_local(self):
        self.assertEqual(ingest.parse_service_date("2025-05-01"), date(2025, 5, 1))
        self.assertIsNone(ingest.parse_service_date("not-a-date"))

    def test_gtfs_day_shift_past_midnight(self):
        service_day = date(2025, 5, 1)
        # Times >= 24:00:00 belong to the preceding service date.
        self.assertEqual(
            ingest.apply_gtfs_day_shift(service_day, "24:40:00"), date(2025, 4, 30)
        )
        self.assertEqual(
            ingest.apply_gtfs_day_shift(service_day, "23:59:00"), date(2025, 5, 1)
        )

    def test_posted_at_iso_normalizes_naive_toronto_time_to_utc(self):
        # May 1 is EDT (UTC-4) in Toronto, so 09:30 local -> 13:30 UTC.
        self.assertEqual(
            ingest.posted_at_iso("2025-05-01T09:30:00"),
            "2025-05-01T13:30:00+00:00",
        )
        self.assertIsNone(ingest.posted_at_iso("nonsense"))


class FakeResponse:
    """Minimal requests.Response stand-in for feed mocking."""

    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.url = "https://api.openmetrolinx.com/OpenDataAPI/api/V1/feed"
        self.text = json.dumps(payload) if payload is not None else "Not Found"

    def raise_for_status(self):
        if self.status_code != 200:
            raise ingest.requests.exceptions.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return self.payload


class MainFlowTests(unittest.TestCase):
    def setUp(self):
        self.alert_payload = {
            "Messages": {
                "Message": [
                    {
                        "Code": "1234",
                        "PostedDateTime": "2025-05-01T09:30:00-04:00",
                        "Category": "Delay",
                        "SubjectEnglish": "Barrie line delay",
                        "BodyEnglish": "Holding at Bradford.",
                        "Lines": [{"Code": "BR"}],
                        "startServiceDate": "2025-05-01",
                        "endServiceDate": "2025-05-01",
                    },
                    {
                        "Code": "9999",
                        "SubjectEnglish": "Lakeshore West delay",
                        "Lines": [{"Code": "LW"}],
                        "startServiceDate": "2025-05-01",
                    },
                ]
            }
        }
        self.trip_payload = {
            "Trip": [
                {
                    "TripNumber": "968",
                    "TripName": "Barrie 968",
                    "IsCancelled": "true",
                    "Stop": [{"StopName": "Allandale Waterfront"}],
                }
            ]
        }

    def _run_main(self, trip_payload):
        def fake_get(url, params=None, timeout=None):
            if "ServiceAlert" in url:
                return FakeResponse(self.alert_payload, 200)
            if trip_payload is None:
                return FakeResponse(None, 404)
            return FakeResponse(trip_payload, 200)

        captured = []
        with mock.patch.object(ingest.requests, "get", side_effect=fake_get), mock.patch.object(
            ingest,
            "sb_upsert",
            side_effect=lambda table, rows, on_conflict: captured.append((table, rows)),
        ):
            ingest.main()
        return captured

    def test_main_upserts_barrie_alerts_and_exceptions(self):
        captured = self._run_main(self.trip_payload)
        self.assertEqual(
            [table for table, _ in captured],
            ["go_api_service_alerts", "go_api_trip_updates"],
        )
        alert_rows = captured[0][1]
        self.assertEqual(len(alert_rows), 1)
        self.assertEqual(alert_rows[0]["alert_id"], "1234")
        self.assertEqual(alert_rows[0]["line_code"], "BR")
        trip_rows = captured[1][1]
        self.assertEqual(len(trip_rows), 1)
        self.assertEqual(trip_rows[0]["trip_id"], "968")
        self.assertEqual(trip_rows[0]["schedule_relationship"], "CANCELED")

    def test_trip_404_does_not_block_alert_upsert(self):
        captured = self._run_main(None)
        self.assertEqual([table for table, _ in captured], ["go_api_service_alerts"])
        self.assertEqual(captured[0][1][0]["alert_id"], "1234")


if __name__ == "__main__":
    unittest.main()