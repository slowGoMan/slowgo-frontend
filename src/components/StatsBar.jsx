import { incidentTypeLabel } from '../lib/constants';
import { impactMinutes, dedupeToLatestObservations } from '../lib/heatmap';

function primaryCulprit(alerts) {
  if (alerts.length === 0) return null;
  const counts = {};
  for (const a of alerts) {
    const key = a.incident_type || 'other';
    counts[key] = (counts[key] || 0) + 1;
  }
  const [type, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { type, pct: Math.round((count / alerts.length) * 100) };
}

// Same shape as primaryCulprit, but over affected_stations instead of
// incident_type - "why" vs "where". Counts station mentions, not alerts, so
// a multi-station segment issue contributes once per station it names.
function busiestStation(alerts) {
  const counts = {};
  let total = 0;
  for (const a of alerts) {
    for (const s of a.affected_stations || []) {
      counts[s] = (counts[s] || 0) + 1;
      total += 1;
    }
  }
  if (total === 0) return null;
  const [station, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return { station, pct: Math.round((count / total) * 100) };
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// A single cancelled train reported from several stations (each its own
// email) would otherwise count as several cancellations. Rows with a
// resolved trip_id collapse to one count per distinct trip; a cancellation
// with no trip_id yet (resolver hasn't run, or GTFS couldn't match it) is
// counted on its own rather than assumed to share an identity with another.
function distinctCancelledTrips(cancelledAlerts) {
  const withTrip = cancelledAlerts.filter((a) => a.trip_id);
  const withoutTrip = cancelledAlerts.filter((a) => !a.trip_id);
  return new Set(withTrip.map((a) => a.trip_id)).size + withoutTrip.length;
}

function StatCard({ label, value, valueClassName = 'text-white', subtext, children }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
      <span className="text-[11px] font-bold text-slate-400 uppercase">{label}</span>
      {value !== undefined && <p className={`text-2xl font-black mt-1 ${valueClassName}`}>{value}</p>}
      {children}
      {subtext && <p className="text-[10px] text-slate-500 font-medium mt-0.5">{subtext}</p>}
    </div>
  );
}

export default function StatsBar({ alerts }) {
  // Total Alerts and Station Cancellations are deliberately raw (they exist
  // specifically to show notice volume) - everything else here represents a
  // real-world quantity, so it's computed from GO's latest word per station
  // stop, not summed across every revision of the same delay estimate.
  const dedupedAlerts = dedupeToLatestObservations(alerts);

  const cancelledAlerts = alerts.filter((a) => a.is_cancellation);
  const dedupedCancelledAlerts = dedupedAlerts.filter((a) => a.is_cancellation);
  const tripsCancelled = distinctCancelledTrips(dedupedCancelledAlerts);
  const delayedAlerts = dedupedAlerts.filter((a) => !a.is_cancellation && (a.max_delay_mins || 0) > 0);
  const avgDelay =
    delayedAlerts.length > 0
      ? Math.round(delayedAlerts.reduce((acc, curr) => acc + (curr.max_delay_mins || 0), 0) / delayedAlerts.length)
      : 0;
  const culprit = primaryCulprit(dedupedAlerts);
  const busiest = busiestStation(dedupedAlerts);
  const totalDelayMinutes = dedupedAlerts.reduce((acc, a) => acc + impactMinutes(a), 0);
  const tripsAffected = new Set(alerts.filter((a) => a.trip_id).map((a) => a.trip_id)).size;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total Alerts" value={alerts.length} />
      <StatCard label="Trips Affected" value={tripsAffected} subtext="confirmed via schedule match" />

      <StatCard label="Total Delay Time" value={formatMinutes(totalDelayMinutes)} valueClassName="text-amber-400" />
      <StatCard label="Avg Delay" value={`${avgDelay}m`} valueClassName="text-amber-400" />

      <StatCard
        label="Station Cancellations"
        value={cancelledAlerts.length}
        valueClassName={cancelledAlerts.length > 0 ? 'text-rose-400' : 'text-white'}
        subtext="raw per-station notices"
      />
      <StatCard
        label="Trips Cancelled"
        value={tripsCancelled}
        valueClassName={tripsCancelled > 0 ? 'text-rose-400' : 'text-white'}
        subtext="distinct trains, via schedule match"
      />

      <StatCard label="Primary Culprit">
        <p className="text-lg font-black text-white mt-1.5 leading-tight break-words">
          {culprit ? incidentTypeLabel(culprit.type) : '—'}
        </p>
        {culprit && <p className="text-xs text-slate-400 font-bold">{culprit.pct}% of incidents</p>}
      </StatCard>
      <StatCard label="Busiest Station">
        <p className="text-lg font-black text-white mt-1.5 leading-tight break-words">{busiest ? busiest.station : '—'}</p>
        {busiest && <p className="text-xs text-slate-400 font-bold">{busiest.pct}% of station reports</p>}
      </StatCard>
    </div>
  );
}
