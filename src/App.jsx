import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLE } from './lib/supabase';
import { isRushHour, torontoToday } from './lib/constants';
import { dedupeToLatestObservations } from './lib/heatmap';
import Header from './components/Header';
import Filters from './components/Filters';
import RailMap from './components/RailMap';
import StatsBar from './components/StatsBar';
import IncidentFeed from './components/IncidentFeed';
import Heatmap from './components/Heatmap';
import TripTracker from './components/TripTracker';

// Shared by both the feed's alerts and the heatmap's own independent
// dataset - "what kind of incident" filters (rush hour, reason, direction)
// are a legitimate slice for either view.
function applyAlertFilters(list, { rushHourOnly, reasonFilter, directionFilter }) {
  return list.filter((a) => {
    if (rushHourOnly && !isRushHour(a.commute_period)) return false;
    if (reasonFilter !== 'all' && a.incident_type !== reasonFilter) return false;
    if (directionFilter !== 'all' && a.direction !== directionFilter) return false;
    return true;
  });
}

function applyStationFilter(list, selectedStation) {
  if (!selectedStation) return list;
  return list.filter((a) => a.affected_stations?.some((s) => s.toLowerCase().includes(selectedStation.name.toLowerCase())));
}

// The heatmap needs its own generous, fixed history window (see
// buildCalendarWeeks) - a "typical week" pattern makes no sense scoped to
// whatever the top time filter is set to (e.g. "Today" would leave it with
// one day of data). 90 days comfortably covers the calendar's own ~12-week
// display window with room to spare.
const HEATMAP_WINDOW_DAYS = 90;

// Everything the frontend actually needs - deliberately excludes raw_body.
// That column is the full, unfiltered source email (HTML, tracking links,
// and whatever GO's own footer includes, e.g. the recipient address) kept
// purely for debugging a misclassified row from the Supabase dashboard -
// select('*') was sending it to every visitor on every page load, which a
// public site should never do with raw inbound data.
const ALERT_COLUMNS =
  'id, received_at, subject, line, incident_type, status, min_delay_mins, max_delay_mins, is_cancellation, affected_stations, affected_segments, summary, created_at, scheduled_time, direction, trip_identifier, eligible_for_refund, advisory_type, service_date, commute_period, observation_key, trip_id, scope, parse_source, update_stage';

export default function App() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [heatmapAlerts, setHeatmapAlerts] = useState([]);

  const [timeFilter, setTimeFilter] = useState('today');
  const [rushHourOnly, setRushHourOnly] = useState(false);
  const [reasonFilter, setReasonFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [selectedStation, setSelectedStation] = useState(null);

  async function fetchHeatmapAlerts() {
    const { data, error: fetchError } = await supabase
      .from(TABLE)
      .select(ALERT_COLUMNS)
      .or('scope.is.null,scope.neq.not_relevant')
      .gte('received_at', new Date(Date.now() - HEATMAP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString());
    if (!fetchError) setHeatmapAlerts(data || []);
  }

  async function fetchAlerts() {
    setLoading(true);
    setError(null);

    let query = supabase
      .from(TABLE)
      .select(ALERT_COLUMNS)
      // Pure marketing/weather broadcasts the worker can now also ingest -
      // never real signal, so excluded before they even reach the client.
      // scope.is.null keeps pre-rewrite rows (written before this column
      // existed) rather than silently dropping them: neq alone would, since
      // SQL's `column != 'x'` is neither true nor false for a null column.
      .or('scope.is.null,scope.neq.not_relevant')
      .order('service_date', { ascending: false })
      .order('scheduled_time', { ascending: false, nullsFirst: false })
      .order('received_at', { ascending: false });

    const now = new Date();
    if (timeFilter === 'today') {
      // Calendar day in Toronto, not a rolling 24h window - "Today" and
      // "Last 24h" answer different questions (this can be a much shorter
      // window right after midnight, or the same ~24h window right before it).
      query = query.eq('service_date', torontoToday());
    } else if (timeFilter === '24h') {
      query = query.gte('received_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    } else if (timeFilter === '7d') {
      query = query.gte('received_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
    } else if (timeFilter === '30d') {
      query = query.gte('received_at', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
    }

    const { data, error: fetchError } = await query;
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAlerts(data || []);
    }
    setLoading(false);
  }

  function refreshAll() {
    fetchAlerts();
    fetchHeatmapAlerts();
  }

  useEffect(() => {
    fetchAlerts();
  }, [timeFilter]);

  useEffect(() => {
    fetchHeatmapAlerts();
  }, []);

  const directions = useMemo(() => {
    const set = new Set(alerts.map((a) => a.direction).filter(Boolean));
    return Array.from(set).sort();
  }, [alerts]);

  const filteredAlerts = useMemo(
    () => applyAlertFilters(alerts, { rushHourOnly, reasonFilter, directionFilter }),
    [alerts, rushHourOnly, reasonFilter, directionFilter]
  );

  const feedAlerts = useMemo(() => applyStationFilter(filteredAlerts, selectedStation), [filteredAlerts, selectedStation]);

  const activeToday = useMemo(() => {
    const today = torontoToday();
    const todays = alerts.filter((a) => a.service_date === today);
    return dedupeToLatestObservations(todays).filter((a) => a.status !== 'resolved').length;
  }, [alerts]);

  const dedupedFilteredAlerts = useMemo(() => dedupeToLatestObservations(filteredAlerts), [filteredAlerts]);

  const heatmapFilteredAlerts = useMemo(
    () => applyAlertFilters(heatmapAlerts, { rushHourOnly, reasonFilter, directionFilter }),
    [heatmapAlerts, rushHourOnly, reasonFilter, directionFilter]
  );
  const heatmapFeedAlerts = useMemo(
    () => applyStationFilter(heatmapFilteredAlerts, selectedStation),
    [heatmapFilteredAlerts, selectedStation]
  );
  const dedupedHeatmapAlerts = useMemo(() => dedupeToLatestObservations(heatmapFeedAlerts), [heatmapFeedAlerts]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <Header activeCount={activeToday} loading={loading} onRefresh={refreshAll} />

      <Filters
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
        rushHourOnly={rushHourOnly}
        setRushHourOnly={setRushHourOnly}
        reasonFilter={reasonFilter}
        setReasonFilter={setReasonFilter}
        directionFilter={directionFilter}
        setDirectionFilter={setDirectionFilter}
        directions={directions}
      />

      {error && (
        <div className="max-w-7xl mx-auto mt-4 bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm px-4 py-3 rounded-xl">
          Couldn&apos;t load data: {error}
        </div>
      )}

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        <RailMap alerts={dedupedFilteredAlerts} selectedStation={selectedStation} onSelectStation={setSelectedStation} />

        <div className="lg:col-span-7 flex flex-col gap-6">
          {selectedStation && (
            <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-300">
                Viewing <span className="text-white">{selectedStation.name}</span> only
              </span>
              <button
                onClick={() => setSelectedStation(null)}
                className="text-[11px] font-bold text-slate-400 hover:text-white bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700"
              >
                Clear &times;
              </button>
            </div>
          )}
          <StatsBar alerts={feedAlerts} />
          <IncidentFeed alerts={feedAlerts} loading={loading} />
        </div>
      </main>

      <section className="max-w-7xl mx-auto mt-6">
        <TripTracker alerts={filteredAlerts} />
      </section>

      <section className="max-w-7xl mx-auto mt-6">
        <Heatmap alerts={dedupedHeatmapAlerts} />
      </section>
    </div>
  );
}
