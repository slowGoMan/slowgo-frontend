-- GTFS reference tables for Barrie-line trip resolution.
-- Populated weekly by scripts/refresh_gtfs.py (.github/workflows/gtfs-refresh.yml).
-- Run this once in the Supabase SQL editor before the workflow's first run.
--
-- Each refresh fully replaces these tables (delete-all + reload). Metrolinx
-- version-stamps route_id/trip_id/service_id per feed release, so there is no
-- stable key to upsert against week to week -- overwrite-on-change is correct.
-- No foreign keys between these tables on purpose: it keeps the delete/reload
-- order irrelevant, which matters for a script that wipes and repopulates
-- everything on every successful run.

create table if not exists gtfs_meta (
  feed_name text primary key,
  etag text,
  last_modified text,
  fetched_at timestamptz
);

create table if not exists gtfs_routes (
  route_id text primary key,
  route_short_name text,
  route_long_name text
);

create table if not exists gtfs_trips (
  trip_id text primary key,
  route_id text not null,
  service_id text not null,
  trip_headsign text,
  direction_id smallint
);

create table if not exists gtfs_stops (
  stop_id text primary key,
  stop_name text not null,
  stop_lat double precision,
  stop_lon double precision
);

-- arrival_time/departure_time stay TEXT, not Postgres `time`: GTFS encodes
-- after-midnight service as >= 24:00:00 (a 00:05 departure is "24:05:00"),
-- which the `time` type can't represent. Parse as text at resolution time.
create table if not exists gtfs_stop_times (
  trip_id text not null,
  stop_id text not null,
  stop_sequence integer not null,
  arrival_time text,
  departure_time text,
  primary key (trip_id, stop_sequence)
);

create table if not exists gtfs_calendar (
  service_id text primary key,
  monday boolean,
  tuesday boolean,
  wednesday boolean,
  thursday boolean,
  friday boolean,
  saturday boolean,
  sunday boolean,
  start_date date,
  end_date date
);

create table if not exists gtfs_calendar_dates (
  service_id text not null,
  date date not null,
  exception_type smallint not null,
  primary key (service_id, date)
);

create index if not exists idx_gtfs_trips_route on gtfs_trips (route_id);
create index if not exists idx_gtfs_stop_times_trip on gtfs_stop_times (trip_id);
create index if not exists idx_gtfs_stop_times_stop on gtfs_stop_times (stop_id);

-- These are public GTFS schedule facts (Metrolinx open data), not sensitive --
-- but the frontend's anon key is public, so lock writes to the service role
-- (which bypasses RLS) and only allow anonymous/public reads.
alter table gtfs_routes enable row level security;
alter table gtfs_trips enable row level security;
alter table gtfs_stops enable row level security;
alter table gtfs_stop_times enable row level security;
alter table gtfs_calendar enable row level security;
alter table gtfs_calendar_dates enable row level security;

create policy "Public read" on gtfs_routes for select using (true);
create policy "Public read" on gtfs_trips for select using (true);
create policy "Public read" on gtfs_stops for select using (true);
create policy "Public read" on gtfs_stop_times for select using (true);
create policy "Public read" on gtfs_calendar for select using (true);
create policy "Public read" on gtfs_calendar_dates for select using (true);
-- gtfs_meta is refresh-script-internal state, not read by the frontend --
-- RLS stays enabled on it with no policies, so only the service role can
-- read or write it.
alter table gtfs_meta enable row level security;
