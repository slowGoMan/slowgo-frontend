import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ---------------------------------------------------------------------------
// Data source switch (phase 3 compatibility layer)
//
// Set VITE_DELAY_DATA_SOURCE=api to point the dashboard at the Metrolinx
// Open Data pipeline's go_api_service_alerts table instead of the original
// email-driven go_train_delays. Any other value (or leaving it unset) keeps
// today's behavior byte-for-byte - the email table is the default fallback,
// so deployments that never opt in are untouched.
// ---------------------------------------------------------------------------
export const DATA_SOURCE = String(import.meta.env.VITE_DELAY_DATA_SOURCE || 'email').toLowerCase();
export const USE_API_DATA_SOURCE = DATA_SOURCE === 'api';

export const TABLE = USE_API_DATA_SOURCE ? 'go_api_service_alerts' : 'go_train_delays';

// The column set go_api_service_alerts actually has (see
// supabase/migrations/20250501_go_api_tables.sql). Consumers reading from the
// api source must select these instead of the go_train_delays-shaped
// ALERT_COLUMNS list used for the email table.
export const API_ALERT_COLUMNS =
  'alert_id, service_date, line_code, delay_minutes, status, message, received_at, raw_json';

// Best-effort direction extraction: go_api_service_alerts has no direction
// column, but the ingestion script stores the original payload in raw_json,
// and the Metrolinx key naming (camel/snake/Pascal) isn't pinned down in-repo.
function apiAlertDirection(row) {
  let raw = row.raw_json;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  for (const key of ['direction', 'directionCode', 'direction_code', 'Direction', 'DirectionCode']) {
    if (raw[key] != null) return String(raw[key]);
  }
  return null;
}

// Statuses the dashboard components understand natively (IncidentFeed's
// STATUS_STYLE keys). Anything else is a raw Metrolinx Category value
// ('Service Disruption', 'Amenity', ...) - either stored before ingestion
// started normalizing, or a genuinely new bucket - and must only render as
// a delay when it actually names trips AND reports delay minutes.
const DASHBOARD_STATUSES = new Set(['delayed', 'cancelled', 'canceled', 'modified', 'advisory', 'resolved']);

function apiAlertRaw(row) {
  let raw = row.raw_json;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw && typeof raw === 'object' ? raw : null;
}

// Metrolinx alerts list affected trips under 'Trips' (empty [] for general
// advisories); a missing/empty list means this is a bulletin, not a delay.
function apiAlertHasTrips(raw) {
  if (!raw) return false;
  const trips = raw.Trips ?? raw.trips ?? raw.Trip ?? raw.trip;
  if (Array.isArray(trips)) return trips.length > 0;
  return trips != null;
}

function normalizeApiStatus(row, raw) {
  const status = String(row.status || 'advisory').toLowerCase();
  if (DASHBOARD_STATUSES.has(status)) return status;
  // Legacy raw Category without trip associations or delay minutes is a
  // non-trip notice: classify as 'advisory' instead of letting the feed's
  // unknown-status fallback render it as a delay.
  return apiAlertHasTrips(raw) && (row.delay_minutes ?? null) !== null ? 'delayed' : 'advisory';
}

// Map a go_api_service_alerts row into the alert schema the dashboard
// components expect: line, direction, delay_minutes, status, message and
// service_date, plus the derived fields StatsBar / IncidentFeed / Heatmap
// actually read (min/max delay, is_cancellation, summary, timestamps). Fields
// the API feed never carries (incident_type, affected_stations, trip_id,
// commute_period, ...) are left undefined so downstream consumers fall back to
// their neutral rendering instead of crashing. service_date passes through
// untouched as a 'YYYY-MM-DD' string - never re-parsed here, because
// `new Date(str)` yields UTC midnight and lands a calendar day off in a
// negative-offset timezone.
export function mapApiAlertToDashboard(row) {
  if (!row) return null;
  const raw = apiAlertRaw(row);
  const status = normalizeApiStatus(row, raw);
  const isCancellation = status === 'cancelled' || status === 'canceled';
  return {
    id: `${row.alert_id}:${row.service_date}`,
    created_at: row.received_at,
    received_at: row.received_at,
    line: row.line_code,
    direction: apiAlertDirection(row),
    delay_minutes: row.delay_minutes ?? null,
    min_delay_mins: row.delay_minutes ?? null,
    max_delay_mins: row.delay_minutes ?? null,
    status,
    message: row.message,
    summary: row.message,
    is_cancellation: isCancellation,
    service_date: row.service_date,
    parse_source: 'go_api_service_alerts',
  };
}

export function mapApiAlertsToDashboard(rows) {
  return (rows || []).map(mapApiAlertToDashboard).filter(Boolean);
}
