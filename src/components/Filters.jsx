import { INCIDENT_TYPES, incidentTypeLabel } from '../lib/constants';

const TIME_FILTERS = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'all', label: 'All Time' },
];

export default function Filters({
  timeFilter,
  setTimeFilter,
  rushHourOnly,
  setRushHourOnly,
  reasonFilter,
  setReasonFilter,
  directionFilter,
  setDirectionFilter,
  directions,
}) {
  return (
    <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3 mt-6">
      <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
        {TIME_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setTimeFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all uppercase ${
              timeFilter === f.id
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => setRushHourOnly((v) => !v)}
        className={`px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide border transition-all ${
          rushHourOnly
            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
        }`}
      >
        Rush Hour Only
      </button>

      <select
        value={reasonFilter}
        onChange={(e) => setReasonFilter(e.target.value)}
        className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wide rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500/50"
      >
        <option value="all">Reason: All</option>
        {INCIDENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {incidentTypeLabel(t)}
          </option>
        ))}
      </select>

      <select
        value={directionFilter}
        onChange={(e) => setDirectionFilter(e.target.value)}
        className="bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold uppercase tracking-wide rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500/50"
      >
        <option value="all">Direction: All</option>
        {directions.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </div>
  );
}
