-- Fills go_train_delays.trip_id for rows where it's null, by matching
-- (station, scheduled_time, direction, service_date) against the loaded
-- Barrie GTFS tables. Only ever touches single-station rows (segment-wide
-- issues with 2+ affected_stations have no single train to resolve to).
-- Run this once in the Supabase SQL editor to (re)create the function; the
-- "Resolve Trip IDs" GitHub Action then calls it periodically via RPC.
--
-- Verified against a real Postgres instance (via @electric-sql/pglite):
-- correctness against synthetic GTFS + observation fixtures covering every
-- branch below (including the exact scenario this exists for - a delay
-- reported at 15:15 Bradford NB and one at 15:05 East Gwillimbury NB both
-- resolving to the same trip_id), AND performance against a synthetic
-- 3,000-row backlog (40 trip patterns) - see wrinkle #5 below for why that
-- second pass mattered.
--
-- Calibration wrinkles handled explicitly (see SLOWGO_HANDOFF.md):
--  1. Direction is derived from each candidate trip's own stop sequence
--     (first stop's geographic position vs last stop's), never trusted
--     from GTFS direction_id - Metrolinx doesn't guarantee which int means
--     which direction, and it can change between feed releases.
--  2. Station names: go_train_delays stores "Bradford" (worker-normalized);
--     gtfs_stops stores "Bradford GO" (confirmed against the real loaded
--     feed) - every one of the 11 stations follows this exact pattern,
--     including Union Station GO, so a single " GO" suffix join works
--     uniformly.
--  3. After-midnight times: gtfs_stop_times keeps arrival/departure_time as
--     TEXT so it can hold GTFS's >=24:00:00 encoding. Matching casts both
--     sides to INTERVAL (unlike TIME, INTERVAL isn't bound to one day) and
--     tries both the literal time and the -24h-shifted time. A GTFS time
--     >=24:00:00 belongs to the PRECEDING service day by GTFS convention,
--     so calendar validity is checked against service_date - 1 for those,
--     not service_date itself.
--  4. Calendar validity respects both calendar (day-of-week + date range)
--     and calendar_dates (explicit exceptions) - including services that
--     exist ONLY via a calendar_dates "added" exception with no weekly
--     calendar row at all (a plain join on gtfs_calendar would silently
--     exclude those; this uses a left join).
--  5. Direction is looked up via a LATERAL subquery keyed to one specific
--     trip_id (index-backed via idx_gtfs_stop_times_trip), NOT a join
--     against a separately window-computed all-trips CTE. An earlier
--     version did the latter and hit Supabase's statement timeout on real
--     data: Postgres chose a plan that re-executed the entire delay x
--     station x stop_times x trips join once PER TRIP (confirmed via
--     EXPLAIN ANALYZE - 40 trips turned a few hundred real rows into 1.7M
--     row comparisons). The LATERAL form is ~20x faster because each
--     candidate's direction is a cheap single-trip lookup instead of a
--     join against every trip's precomputed direction.
--     (A tempting further "fix" is capping how many unresolved rows are
--     considered per run with `... order by id limit N`. Don't - a
--     genuinely unmatchable row (no real GTFS trip fits it) never leaves
--     the pool, so it permanently occupies a slot at whichever end of the
--     id ordering is prioritized and starves every row behind it, even
--     across unlimited reruns. Confirmed empirically: capping at 500
--     converged to under half the resolvable rows in a 3,000-row backlog,
--     regardless of sort direction. The LATERAL fix alone resolved the
--     full realistic backlog in ~300ms with no cap needed - the cap here
--     is a defensive ceiling for a scenario that shouldn't happen, not a
--     routine constraint.
create or replace function resolve_trip_ids() returns integer as $$
declare
  resolved_count integer := 0;
begin
  with station_order (stop_name, ord) as (
    values
      ('Allandale Waterfront GO', 1),
      ('Barrie South GO', 2),
      ('Bradford GO', 3),
      ('East Gwillimbury GO', 4),
      ('Newmarket GO', 5),
      ('Aurora GO', 6),
      ('King City GO', 7),
      ('Maple GO', 8),
      ('Rutherford GO', 9),
      ('Downsview Park GO', 10),
      ('Union Station GO', 11)
  ),
  candidate_delays as (
    select id, affected_stations, scheduled_time, direction, service_date
    from go_train_delays
    where trip_id is null
      and scheduled_time is not null
      and direction is not null
      and service_date is not null
      and array_length(affected_stations, 1) = 1
    order by id desc
    limit 20000
  ),
  raw_matches as (
    select
      d.id as delay_id,
      t.trip_id,
      t.service_id,
      -- A GTFS time >=24:00:00 ("24:40:00") and a worker-reported "00:40:00"
      -- describe the same wall-clock moment under two conventions - the GTFS
      -- side needs 24h SUBTRACTED to line up with the observation's normal
      -- 00:00-23:59 range (the observation side is never itself shifted;
      -- the worker always reports normal-range times, never >=24:00:00).
      least(
        abs(extract(epoch from (st.departure_time::interval - d.scheduled_time::interval))),
        abs(extract(epoch from ((st.departure_time::interval - interval '24 hours') - d.scheduled_time::interval)))
      ) as time_diff_seconds,
      case
        when st.departure_time::interval >= interval '24 hours' then d.service_date - 1
        else d.service_date
      end as effective_date
    from candidate_delays d
    join gtfs_stops gs on gs.stop_name = d.affected_stations[1] || ' GO'
    join gtfs_stop_times st on st.stop_id = gs.stop_id
    join gtfs_trips t on t.trip_id = st.trip_id
    -- Direction for THIS SPECIFIC trip only (see wrinkle #5 above) - an
    -- index-backed single-trip lookup, not a join against an all-trips CTE.
    cross join lateral (
      select case when first_ord.ord < last_ord.ord then 'Southbound' else 'Northbound' end as direction
      from (select stop_id from gtfs_stop_times where trip_id = t.trip_id order by stop_sequence asc limit 1) fe
      join gtfs_stops fs on fs.stop_id = fe.stop_id
      join station_order first_ord on first_ord.stop_name = fs.stop_name
      cross join (select stop_id from gtfs_stop_times where trip_id = t.trip_id order by stop_sequence desc limit 1) le
      join gtfs_stops ls on ls.stop_id = le.stop_id
      join station_order last_ord on last_ord.stop_name = ls.stop_name
    ) td
    where td.direction = d.direction
  ),
  candidates as (
    select
      rm.delay_id,
      rm.trip_id,
      row_number() over (partition by rm.delay_id order by rm.time_diff_seconds) as rn
    from raw_matches rm
    left join gtfs_calendar cal on cal.service_id = rm.service_id
    left join gtfs_calendar_dates cd on cd.service_id = rm.service_id and cd.date = rm.effective_date
    where rm.time_diff_seconds <= 300
      and coalesce(cd.exception_type, 0) != 2
      and (
        cd.exception_type = 1
        or (
          cal.start_date <= rm.effective_date and cal.end_date >= rm.effective_date
          and case extract(dow from rm.effective_date)
            when 0 then cal.sunday
            when 1 then cal.monday
            when 2 then cal.tuesday
            when 3 then cal.wednesday
            when 4 then cal.thursday
            when 5 then cal.friday
            when 6 then cal.saturday
          end
        )
      )
  )
  update go_train_delays d
  set trip_id = c.trip_id
  from candidates c
  where c.delay_id = d.id and c.rn = 1;

  get diagnostics resolved_count = row_count;
  return resolved_count;
end;
$$ language plpgsql;

-- The frontend's anon key is public, so this must not be callable with it -
-- only the service_role key (used by the GitHub Action) may invoke it.
revoke execute on function resolve_trip_ids() from public, anon, authenticated;
grant execute on function resolve_trip_ids() to service_role;
