import { incidentTypeLabel } from '../lib/constants';
import { impactMinutes } from '../lib/heatmap';

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

export default function StatsBar({ alerts }) {
  const cancelledAlerts = alerts.filter((a) => a.is_cancellation);
  const cancellations = distinctCancelledTrips(cancelledAlerts);
  const delayedAlerts = alerts.filter((a) => !a.is_cancellation && (a.max_delay_mins || 0) > 0);
  const avgDelay =
    delayedAlerts.length > 0
      ? Math.round(delayedAlerts.reduce((acc, curr) => acc + (curr.max_delay_mins || 0), 0) / delayedAlerts.length)
      : 0;
  const culprit = primaryCulprit(alerts);
  const totalDelayMinutes = alerts.reduce((acc, a) => acc + impactMinutes(a), 0);
  const tripsAffected = new Set(alerts.filter((a) => a.trip_id).map((a) => a.trip_id)).size;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Total Alerts</span>
        <p className="text-2xl font-black text-white mt-1">{alerts.length}</p>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Trips Affected</span>
        <p className="text-2xl font-black text-white mt-1">{tripsAffected}</p>
        <p className="text-[10px] text-slate-500 font-medium mt-0.5">confirmed via schedule match</p>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Total Delay Time</span>
        <p className="text-2xl font-black text-amber-400 mt-1">{formatMinutes(totalDelayMinutes)}</p>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Cancellations</span>
        <p className={`text-2xl font-black mt-1 ${cancellations > 0 ? 'text-rose-400' : 'text-white'}`}>
          {cancellations}
        </p>
        {cancelledAlerts.length !== cancellations && (
          <p className="text-[10px] text-slate-500 font-medium mt-0.5">
            {cancelledAlerts.length} notice{cancelledAlerts.length === 1 ? '' : 's'} received
          </p>
        )}
      </div>
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Avg Delay</span>
        <p className="text-2xl font-black text-amber-400 mt-1">{avgDelay}m</p>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Primary Culprit</span>
        <p className="text-lg font-black text-white mt-1.5 leading-tight break-words">
          {culprit ? incidentTypeLabel(culprit.type) : '—'}
        </p>
        {culprit && <p className="text-xs text-slate-400 font-bold">{culprit.pct}% of incidents</p>}
      </div>
    </div>
  );
}
