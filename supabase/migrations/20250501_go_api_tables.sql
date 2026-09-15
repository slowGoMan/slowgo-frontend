-- Phase 1/3: dedicated tables for the Metrolinx Open API ingestion pipeline
-- (ServiceUpdates + TripUpdates feeds). Additive and self-contained: the
-- existing email-driven pipeline (go_train_delays) and its tables are
-- untouched, so nothing downstream changes until the frontend switch lands
-- in phase 3.
--
-- Conventions carried over from the rest of the repo (see PROGRESS.md):
--  * service_date is the Toronto-LOCAL service date. Ingestors must parse
--    'YYYY-MM-DD' strings with a local-date parser (like
--    src/lib/heatmap.js' parseServiceDate), never `new Date(str)`, which
--    yields UTC midnight and can land a calendar day off in a negative-
--    offset timezone. GTFS departure times >= 24:00:00 belong to
--    service_date - 1 by GTFS convention.
--  * Row level security mirrors supabase/gtfs_schema.sql: anon/authenticated
--    can only SELECT. All writes go through the SUPABASE_SERVICE_KEY, whose
--    service_role bypasses RLS natively -- the explicit `to service_role`
--    policies below state that intent in SQL and keep anonymous writes
--    blocked even if BYPASSRLS is ever revoked.

-- ---------------------------------------------------------------------------
-- go_api_service_alerts: one row per Metrolinx ServiceUpdates alert per
-- service date it covers. alert_id + service_date is the dedup key: the
-- ingestion script upserts on (alert_id, service_date), so re-fetching the
-- same alert the same day updates the row instead of duplicating it, and a
-- multi-day alert gets one row per day (which is what the independent
-- 84-90 day heatmap window consumes downstream).
-- ---------------------------------------------------------------------------
create table if not exists go_api_service_alerts (
  alert_id text not null,              -- Metrolinx/ServiceUpdates alert id
  service_date date not null,          -- Toronto-local service date the alert covers
  line_code text,                      -- e.g. 'BR' / 'Barrie'
  delay_minutes integer,               -- reported delay at alert level, minutes
  status text,                         -- e.g. delayed / cancelled / advisory / resolved
  message text,                        -- human-readable alert text
  raw_json jsonb,                      -- original API payload for re-parsing/debugging
  received_at timestamptz not null default now(),
  primary key (alert_id, service_date)
);

-- Heatmap date-window scans, line-scoped dashboard filters, and recent-pull
-- sweeps get their own index; the PK index (alert_id, service_date) cannot
-- serve standalone service_date lookups.
create index if not exists idx_go_api_service_alerts_service_date on go_api_service_alerts (service_date);
create index if not exists idx_go_api_service_alerts_line_code   on go_api_service_alerts (line_code);
create index if not exists idx_go_api_service_alerts_received_at on go_api_service_alerts (received_at);

-- ---------------------------------------------------------------------------
-- go_api_trip_updates: latest real-time snapshot per GTFS trip from the
-- TripUpdates feed. One row per trip_id -- every poll replaces the previous
-- snapshot for that trip (upsert on trip_id, fresher updated_at wins).
-- stop_time_updates keeps the raw stop_time_update array as jsonb so phase 3
-- can read per-station delays without flattening anything here.
-- ---------------------------------------------------------------------------
create table if not exists go_api_trip_updates (
  trip_id text not null,               -- GTFS trip_id from the TripUpdates feed
  line_code text,                      -- e.g. 'BR' / 'Barrie'
  direction_code text,                 -- raw direction encoding from the feed
  delay_seconds integer,               -- trip-level delay, seconds (GTFS-RT Delay)
  schedule_relationship text,          -- SCHEDULED / ADDED / CANCELED / REPLACEMENT / ...
  stop_time_updates jsonb,             -- raw stop_time_update[] array
  updated_at timestamptz not null default now()  -- snapshot time, used for dedup
);

-- The unique index doubles as the requested trip_id index AND the conflict
-- target for the ingestion upsert.
create unique index if not exists idx_go_api_trip_updates_trip_id on go_api_trip_updates (trip_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: public (anon) read, service-role write only.
-- ---------------------------------------------------------------------------
alter table go_api_service_alerts enable row level security;
alter table go_api_trip_updates enable row level security;

create policy "Public read" on go_api_service_alerts for select using (true);
create policy "Service role insert" on go_api_service_alerts for insert to service_role with check (true);
create policy "Service role update" on go_api_service_alerts for update to service_role using (true) with check (true);
create policy "Service role delete" on go_api_service_alerts for delete to service_role using (true);

create policy "Public read" on go_api_trip_updates for select using (true);
create policy "Service role insert" on go_api_trip_updates for insert to service_role with check (true);
create policy "Service role update" on go_api_trip_updates for update to service_role using (true) with check (true);
create policy "Service role delete" on go_api_trip_updates for delete to service_role using (true);