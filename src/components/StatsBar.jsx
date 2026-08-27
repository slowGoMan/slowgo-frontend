import { incidentTypeLabel } from '../lib/constants';

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

export default function StatsBar({ alerts }) {
  const cancellations = alerts.filter((a) => a.is_cancellation).length;
  const delayedAlerts = alerts.filter((a) => !a.is_cancellation && (a.max_delay_mins || 0) > 0);
  const avgDelay =
    delayedAlerts.length > 0
      ? Math.round(delayedAlerts.reduce((acc, curr) => acc + (curr.max_delay_mins || 0), 0) / delayedAlerts.length)
      : 0;
  const culprit = primaryCulprit(alerts);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Total Incidents</span>
        <p className="text-2xl font-black text-white mt-1">{alerts.length}</p>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Cancellations</span>
        <p className="text-2xl font-black text-rose-400 mt-1">{cancellations}</p>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Avg Delay</span>
        <p className="text-2xl font-black text-amber-400 mt-1">{avgDelay}m</p>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <span className="text-[11px] font-bold text-slate-400 uppercase">Primary Culprit</span>
        <p className="text-2xl font-black text-white mt-1 truncate">
          {culprit ? `${incidentTypeLabel(culprit.type)}` : '—'}
          {culprit && <span className="text-sm text-slate-400 font-bold"> ({culprit.pct}%)</span>}
        </p>
      </div>
    </div>
  );
}
