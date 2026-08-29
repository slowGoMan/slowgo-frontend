"""Weekly Barrie-line GTFS refresh into Supabase.

Downloads Metrolinx's full GO GTFS feed, filters it down to the Barrie line,
and replaces the gtfs_* tables in Supabase wholesale. See
supabase/gtfs_schema.sql for the tables this expects to already exist.

Runs from .github/workflows/gtfs-refresh.yml (weekly cron + manual dispatch).
"""

import csv
import io
import os
import sys
import zipfile
from datetime import datetime, timezone

import requests

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
REST_URL = f"{SUPABASE_URL}/rest/v1"

FEED_URL = "https://assets.metrolinx.com/raw/upload/Documents/Metrolinx/Open%20Data/GO-GTFS.zip"
FEED_NAME = "go-gtfs"


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
    # gtfs_schema.sql hasn't been run yet) lives in the response body, which
    # a bare raise_for_status() discards.
    if not resp.ok:
        print(f"Supabase error {resp.status_code} for {resp.url}: {resp.text}", file=sys.stderr)
    resp.raise_for_status()


def sb_get(table, params):
    resp = requests.get(f"{REST_URL}/{table}", headers=sb_headers(), params=params, timeout=30)
    raise_for_status_verbose(resp)
    return resp.json()


def sb_delete_all(table, not_null_column):
    # PostgREST requires a filter for DELETE; filtering a NOT NULL column
    # against "not.is.null" is the standard way to mean "every row".
    resp = requests.delete(
        f"{REST_URL}/{table}",
        headers=sb_headers(prefer="return=minimal"),
        params={not_null_column: "not.is.null"},
        timeout=60,
    )
    raise_for_status_verbose(resp)


def sb_insert(table, rows, chunk_size=500):
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        resp = requests.post(
            f"{REST_URL}/{table}",
            headers=sb_headers(prefer="return=minimal"),
            json=chunk,
            timeout=60,
        )
        raise_for_status_verbose(resp)


def open_csv(zf, filename):
    # Handle feeds that nest the .txt files inside a subfolder.
    matches = [n for n in zf.namelist() if n == filename or n.endswith("/" + filename)]
    if not matches:
        return None
    with zf.open(matches[0]) as f:
        text = f.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def is_barrie_route(row):
    return (row.get("route_short_name") or "").strip().upper() == "BR" or (
        row.get("route_long_name") or ""
    ).strip().lower() == "barrie"


def to_bool(v):
    return v == "1"


def to_int(v):
    return int(v) if v not in (None, "") else None


def to_float(v):
    return float(v) if v not in (None, "") else None


def gtfs_date_to_iso(v):
    return f"{v[0:4]}-{v[4:6]}-{v[6:8]}" if v and len(v) == 8 else None


def fetch_stored_meta():
    rows = sb_get(
        "gtfs_meta",
        {"feed_name": f"eq.{FEED_NAME}", "select": "etag,last_modified"},
    )
    if rows:
        return rows[0].get("etag"), rows[0].get("last_modified")
    return None, None


def download_feed(etag, last_modified):
    headers = {}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    return requests.get(FEED_URL, headers=headers, timeout=(10, 180))


def main():
    etag, last_modified = fetch_stored_meta()
    resp = download_feed(etag, last_modified)

    if resp.status_code == 304:
        print("GTFS feed unchanged (304 Not Modified) - skipping refresh.")
        return

    resp.raise_for_status()
    new_etag = resp.headers.get("ETag")
    new_last_modified = resp.headers.get("Last-Modified")

    zf = zipfile.ZipFile(io.BytesIO(resp.content))

    routes = open_csv(zf, "routes.txt") or []
    barrie_routes = [r for r in routes if is_barrie_route(r)]
    if not barrie_routes:
        raise RuntimeError(
            "No Barrie route found in GTFS feed (route_short_name='BR' / "
            "route_long_name='Barrie') - Metrolinx may have renamed it"
        )
    barrie_route_ids = {r["route_id"] for r in barrie_routes}

    trips = open_csv(zf, "trips.txt") or []
    barrie_trips = [t for t in trips if t["route_id"] in barrie_route_ids]
    barrie_trip_ids = {t["trip_id"] for t in barrie_trips}
    barrie_service_ids = {t["service_id"] for t in barrie_trips}

    stop_times = open_csv(zf, "stop_times.txt") or []
    barrie_stop_times = [st for st in stop_times if st["trip_id"] in barrie_trip_ids]
    barrie_stop_ids = {st["stop_id"] for st in barrie_stop_times}

    stops = open_csv(zf, "stops.txt") or []
    barrie_stops = [s for s in stops if s["stop_id"] in barrie_stop_ids]

    calendar = open_csv(zf, "calendar.txt") or []
    barrie_calendar = [c for c in calendar if c["service_id"] in barrie_service_ids]

    calendar_dates = open_csv(zf, "calendar_dates.txt") or []
    barrie_calendar_dates = [d for d in calendar_dates if d["service_id"] in barrie_service_ids]

    routes_rows = [
        {
            "route_id": r["route_id"],
            "route_short_name": r.get("route_short_name") or None,
            "route_long_name": r.get("route_long_name") or None,
        }
        for r in barrie_routes
    ]
    stops_rows = [
        {
            "stop_id": s["stop_id"],
            "stop_name": s.get("stop_name") or None,
            "stop_lat": to_float(s.get("stop_lat")),
            "stop_lon": to_float(s.get("stop_lon")),
        }
        for s in barrie_stops
    ]
    trips_rows = [
        {
            "trip_id": t["trip_id"],
            "route_id": t["route_id"],
            "service_id": t["service_id"],
            "trip_headsign": t.get("trip_headsign") or None,
            "direction_id": to_int(t.get("direction_id")),
        }
        for t in barrie_trips
    ]
    stop_times_rows = [
        {
            "trip_id": st["trip_id"],
            "stop_id": st["stop_id"],
            "stop_sequence": to_int(st["stop_sequence"]),
            "arrival_time": st.get("arrival_time") or None,
            "departure_time": st.get("departure_time") or None,
        }
        for st in barrie_stop_times
    ]
    calendar_rows = [
        {
            "service_id": c["service_id"],
            "monday": to_bool(c.get("monday")),
            "tuesday": to_bool(c.get("tuesday")),
            "wednesday": to_bool(c.get("wednesday")),
            "thursday": to_bool(c.get("thursday")),
            "friday": to_bool(c.get("friday")),
            "saturday": to_bool(c.get("saturday")),
            "sunday": to_bool(c.get("sunday")),
            "start_date": gtfs_date_to_iso(c.get("start_date")),
            "end_date": gtfs_date_to_iso(c.get("end_date")),
        }
        for c in barrie_calendar
    ]
    calendar_dates_rows = [
        {
            "service_id": d["service_id"],
            "date": gtfs_date_to_iso(d.get("date")),
            "exception_type": to_int(d.get("exception_type")),
        }
        for d in barrie_calendar_dates
    ]

    print(
        f"Filtered to Barrie line: {len(routes_rows)} route(s), {len(stops_rows)} stops, "
        f"{len(trips_rows)} trips, {len(stop_times_rows)} stop_times, "
        f"{len(calendar_rows)} calendar rows, {len(calendar_dates_rows)} calendar_dates rows"
    )

    for table, pk in [
        ("gtfs_stop_times", "trip_id"),
        ("gtfs_trips", "trip_id"),
        ("gtfs_calendar_dates", "service_id"),
        ("gtfs_calendar", "service_id"),
        ("gtfs_stops", "stop_id"),
        ("gtfs_routes", "route_id"),
    ]:
        sb_delete_all(table, pk)

    sb_insert("gtfs_routes", routes_rows)
    sb_insert("gtfs_stops", stops_rows)
    sb_insert("gtfs_calendar", calendar_rows)
    sb_insert("gtfs_calendar_dates", calendar_dates_rows)
    sb_insert("gtfs_trips", trips_rows)
    sb_insert("gtfs_stop_times", stop_times_rows)

    sb_delete_all("gtfs_meta", "feed_name")
    sb_insert(
        "gtfs_meta",
        [
            {
                "feed_name": FEED_NAME,
                "etag": new_etag,
                "last_modified": new_last_modified,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
    )

    print("GTFS refresh complete.")


if __name__ == "__main__":
    main()
