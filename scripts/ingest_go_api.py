"""Poll the Metrolinx/GO Transit Open Data API and persist Barrie-line delays.

Phase 2/3 of the GO Transit Open API pipeline. Polls the two real-time feeds
- ServiceUpdate/ServiceAlert/All (advisories + delays)
- ServiceUpdate/TripUpdates (live trip snapshots)
and upserts them into the phase-1 tables go_api_service_alerts /
go_api_trip_updates (see supabase/migrations/20250501_go_api_tables.sql).
Idempotent: re-fetching the same alert/day or trip replaces the previous row
instead of duplicating it.

Runs from .github/workflows/ingest_go_api.yml (5-10 min cron + manual
dispatch). Writes go through SUPABASE_SERVICE_KEY only - the frontend anon
key is read-only and RLS blocks table writes from it anyway.

Pitfalls handled (see PROGRESS.md and the migration header):
  * 'YYYY-MM-DD' service dates are parsed into naive local dates with
    strptime - the Python equivalent of the frontend's parseServiceDate().
    `new Date(str)`/UTC parsing would land a calendar day off in a negative-
    offset timezone.
  * GTFS times >= 24:00:00 (e.g. 24:40:00) belong to the preceding service
    date (service_date - 1); a 00:40 departure on service date D is encoded
    as 24:40:00 on D.
  * Toronto-local dates come from zoneinfo America/Toronto, never the
    runner's UTC clock.
  * ServiceUpdate/TripUpdates is not a real Metrolinx JSON endpoint (HTTP
    404); TripUpdates is treated as an optional feed so a failure there only
    logs a warning and lets the ServiceAlert upsert finish. GTFS-RT Trip
    Updates live under Gtfs/Feed/TripUpdates as protocol buffers, which this
    JSON pipeline intentionally does not consume.
"""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

import requests

METROLINX_API_KEY = os.environ.get("METROLINX_API_KEY") or "30029868"
# Metrolinx Open Data API base. Overridable for staging/alternate endpoints.
METROLINX_BASE_URL = os.environ.get(
    "METROLINX_BASE_URL", "https://api.openmetrolinx.com/OpenDataAPI/api/V1"
)
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
REST_URL = f"{SUPABASE_URL}/rest/v1"

ALERTS_ENDPOINT = "ServiceUpdate/ServiceAlert/All"
TRIP_UPDATES_ENDPOINT = "ServiceUpdate/TripUpdates"

# Barrie line identifies itself as 'BR' (GTFS route_short_name) or 'Barrie'
# (route_long_name / corridor) across both feeds.
BARRIE_CODES = {"BR", "BARRIE"}

TORONTO = ZoneInfo("America/Toronto")


def sb_headers(prefer=None):
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    return headers


def raise_for_status_verbose(resp):
    # PostgREST's actual error detail (e.g. "relation ... does not exist" if
    # the phase-1 migration hasn't been applied) lives in the response body,
    # which a bare raise_for_status() discards.
    if not resp.ok:
        print(f"Supabase error {resp.status_code} for {resp.url}: {resp.text}", file=sys.stderr)
    resp.raise_for_status()


def sb_upsert(table, rows, on_conflict, chunk_size=500):
    """Idempotent upsert via PostgREST INSERT ... ON CONFLICT.

    Prefer resolution=merge-duplicates makes the conflict target update the
    existing row instead of erroring, so re-polling the same alert/day or
    trip replaces the snapshot rather than duplicating it.
    """
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        resp = requests.post(
            f"{REST_URL}/{table}",
            headers=sb_headers(prefer="return=minimal,resolution=merge-duplicates"),
            params={"on_conflict": on_conflict},
            json=chunk,
            timeout=60,
        )
        raise_for_status_verbose(resp)


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def toronto_today():
    return datetime.now(TORONTO).date()


def parse_service_date(value):
    """Parse 'YYYY-MM-DD' (or an ISO datetime) into a naive local date.

    Uses strptime on the local calendar string, mirroring the frontend's
    parseServiceDate(): never `new Date(str)`/UTC, which can land a calendar
    day off in a negative-offset timezone.
    """
    if not value:
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _get(obj, *keys, default=None):
    """First present, non-None value among candidate keys (camel/snake/Pascal)."""
    for key in keys:
        if isinstance(obj, dict) and key in obj and obj[key] is not None:
            return obj[key]
    return default


def is_barrie_line(entity):
    """True if any line/corridor/route field marks an entity as Barrie."""
    if not isinstance(entity, dict):
        return False
    for key in (
        "lineCode", "line_code", "LineCode",
        "routeCode", "route_code", "RouteCode",
        "corridor", "Corridor", "line", "Line",
    ):
        value = entity.get(key)
        if value is not None and str(value).strip().upper() in BARRIE_CODES:
            return True
    # TripUpdate entities sometimes nest the route under a 'trip' object.
    trip = entity.get("trip")
    if isinstance(trip, dict):
        for key in ("routeId", "route_id", "lineCode", "line_code"):
            value = trip.get(key)
            if value is not None and str(value).strip().upper() in BARRIE_CODES:
                return True
    # Alerts list affected services as a nested array (e.g. [{code: 'BR'}]).
    for key in ("routes", "Routes", "affectedServices", "AffectedServices"):
        value = entity.get(key)
        if not isinstance(value, list):
            continue
        for item in value:
            if isinstance(item, dict):
                code = _get(item, "lineCode", "line_code", "routeCode", "route_code", "code")
                if code is not None and str(code).strip().upper() in BARRIE_CODES:
                    return True
            elif str(item).strip().upper() in BARRIE_CODES:
                return True
    return False


def alert_service_dates(entity):
    """Service dates an alert covers.

    Metrolinx alerts can span multiple days; the migration keys each row on
    (alert_id, service_date) and the downstream 84-90 day heatmap window
    consumes one row per day, so a [start..end] range expands to one date per
    day. Unknown dates fall back to the Toronto-local today.
    """
    start_raw = _get(
        entity,
        "serviceDate", "service_date",
        "startServiceDate", "start_service_date",
        "startDate", "start_date",
    )
    end_raw = _get(entity, "endServiceDate", "end_service_date", "endDate", "end_date")
    start = parse_service_date(start_raw)
    end = parse_service_date(end_raw)
    if start is None:
        return [toronto_today()]
    if end is None or end < start:
        return [start]
    days = []
    day = start
    while day <= end:
        days.append(day)
        day += timedelta(days=1)
    return days


def apply_gtfs_day_shift(service_day, time_str):
    """GTFS times >= 24:00:00 encode the previous service date's departures."""
    if service_day is not None and time_str and str(time_str) >= "24:00:00":
        return service_day - timedelta(days=1)
    return service_day


def map_alert(alert):
    """Map one ServiceUpdates entity into (alert_id, service_date) rows."""
    if not is_barrie_line(alert):
        return []
    alert_id = str(_get(alert, "alertId", "alert_id", "serviceAlertId", "id") or "").strip()
    if not alert_id:
        return []
    delay = to_int(_get(alert, "delayMinutes", "delay_minutes", "DelayMinutes", "delay"))
    status = _get(alert, "status", "alertStatus", "AlertStatus")
    if status is not None:
        status = str(status)[:100]
    message = _get(alert, "message", "headline", "Headline", "description", "text")
    if message is not None:
        message = str(message)
    start_time = _get(alert, "startTime", "start_time", "StartTime")

    rows = []
    for service_day in alert_service_dates(alert):
        service_day = apply_gtfs_day_shift(service_day, start_time)
        rows.append(
            {
                "alert_id": alert_id,
                "service_date": service_day.isoformat(),
                "line_code": "BR",
                "delay_minutes": delay,
                "status": status,
                "message": message,
                "raw_json": json.dumps(alert),
            }
        )
    return rows


def map_trip_update(entity):
    """Map one TripUpdates entity into a trip_id-keyed snapshot row."""
    if not is_barrie_line(entity):
        return None
    trip_id = str(_get(entity, "tripId", "trip_id", "tripIdentifier", "TripId") or "").strip()
    if not trip_id:
        return None
    trip = entity.get("trip") if isinstance(entity.get("trip"), dict) else {}
    delay = to_int(
        _get(entity, "delaySeconds", "delay_seconds", "DelaySeconds", "delay")
        or _get(trip, "delaySeconds", "delay_seconds", "DelaySeconds", "delay")
    )
    direction = str(
        _get(entity, "directionCode", "direction_code", "directionId", "direction_id")
        or _get(trip, "directionCode", "direction_code", "directionId", "direction_id")
        or ""
    )
    relationship = _get(entity, "scheduleRelationship", "schedule_relationship", "ScheduleRelationship")
    stop_updates = _get(entity, "stopTimeUpdates", "stop_time_updates", "StopTimeUpdates") or []
    return {
        "trip_id": trip_id,
        "line_code": "BR",
        "direction_code": direction,
        "delay_seconds": delay,
        "schedule_relationship": str(relationship) if relationship is not None else None,
        "stop_time_updates": json.dumps(stop_updates),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def fetch_feed(endpoint, required=True):
    """Fetch a Metrolinx feed and decode it as JSON.

    required=False marks an optional feed (e.g. TRIP_UPDATES_ENDPOINT): a
    404 'Not Found' or any other HTTP/network error logs an informative
    warning and yields an empty payload instead of aborting the run, so the
    already-fetched ServiceAlert records still get upserted.
    """
    url = f"{METROLINX_BASE_URL}/{endpoint}"
    try:
        resp = requests.get(url, params={"key": METROLINX_API_KEY}, timeout=(10, 60))
        if resp.status_code != 200:
            print(f"Metrolinx error {resp.status_code} for {url}: {resp.text}", file=sys.stderr)
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.RequestException as exc:
        if not required:
            print(
                f"WARNING: {endpoint} unavailable ({exc}); skipping trip "
                f"updates for this run and continuing with service alerts.",
                file=sys.stderr,
            )
            return []
        raise


def extract_entities(payload, *candidates):
    """Pull the entity list out of a feed payload.

    The Metrolinx envelope isn't documented in-repo, so accept a bare list,
    a {'ServiceAlerts': [...]}-style wrapper, or one level of nesting
    ({'ServiceUpdate': {'ServiceAlert': [...]}}).
    """
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in candidates:
        value = payload.get(key)
        if isinstance(value, list):
            return value
    for value in payload.values():
        if isinstance(value, dict):
            for key in candidates:
                inner = value.get(key)
                if isinstance(inner, list):
                    return inner
    return []


def main():
    alerts_payload = fetch_feed(ALERTS_ENDPOINT)
    alerts = extract_entities(
        alerts_payload, "ServiceAlerts", "Alerts", "serviceAlerts", "ServiceAlert", "alerts"
    )
    alert_rows = []
    for alert in alerts:
        alert_rows.extend(map_alert(alert))

    # TripUpdates is optional: Metrolinx may 404 on it (or serve GTFS-RT
    # protobuf elsewhere), so a failure must never block the alert ingest.
    try:
        trips_payload = fetch_feed(TRIP_UPDATES_ENDPOINT, required=False)
    except requests.exceptions.RequestException as exc:
        print(
            f"WARNING: {TRIP_UPDATES_ENDPOINT} unavailable ({exc}); skipping "
            f"trip updates for this run and continuing with service alerts.",
            file=sys.stderr,
        )
        trips_payload = []
    trips = extract_entities(
        trips_payload, "TripUpdates", "TripUpdate", "tripUpdates", "trip_updates"
    )
    trip_rows = [row for row in (map_trip_update(t) for t in trips) if row]

    if not alert_rows and not trip_rows:
        print(
            "WARNING: no Barrie entities found in either feed - check the Metrolinx "
            "response shape and the METROLINX_BASE_URL endpoint paths.",
            file=sys.stderr,
        )

    if alert_rows:
        sb_upsert("go_api_service_alerts", alert_rows, "alert_id,service_date")
    if trip_rows:
        sb_upsert("go_api_trip_updates", trip_rows, "trip_id")

    print(
        f"GO Transit API ingest complete: {len(alert_rows)} Barrie alert-day row(s) "
        f"upserted into go_api_service_alerts, {len(trip_rows)} Barrie trip "
        f"snapshot(s) upserted into go_api_trip_updates."
    )


if __name__ == "__main__":
    main()