import { useState } from 'react';
import { WEEKDAYS, PERIODS, BUCKET_STYLE } from '../lib/heatmap';

export default function PeriodHeatmap({ cells }) {
  const byKey = new Map(cells.map((c) => [`${c.weekday}-${c.period}`, c]));
  const [active, setActive] = useState(null);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">Weekly Pattern</h3>
      <p className="text-[11px] text-slate-500 mb-4">Typical delay impact per week, by day &amp; commute period</p>

      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          <div className="grid grid-cols-[40px_repeat(5,1fr)] gap-1.5 mb-1.5">
            <div />
            {PERIODS.map((p) => (
              <div key={p.id} className="text-[9px] font-bold uppercase tracking-wide text-slate-500 text-center">
                {p.label}
              </div>
            ))}
          </div>

          {WEEKDAYS.map((day, weekday) => (
            <div key={day} className="grid grid-cols-[40px_repeat(5,1fr)] gap-1.5 mb-1.5">
              <div className="text-[10px] font-bold text-slate-500 flex items-center">{day}</div>
              {PERIODS.map((p) => {
                const cell = byKey.get(`${weekday}-${p.id}`);
                const style = BUCKET_STYLE[cell?.bucket ?? 0];
                const tooltip =
                  cell && cell.count > 0
                    ? `${day} · ${p.label}\n${cell.count} alert${cell.count === 1 ? '' : 's'}${
                        cell.cancellations > 0 ? `, ${cell.cancellations} cancelled` : ''
                      }\n~${Math.round(cell.avgImpact)}m avg impact`
                    : `${day} · ${p.label}: no incidents`;

                return (
                  <button
                    key={p.id}
                    type="button"
                    title={tooltip}
                    onClick={() => setActive(cell && cell.count > 0 ? { day, period: p.label, cell } : null)}
                    className="aspect-square"
                  >
                    <div
                      className={`w-full h-full rounded-lg border flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-105 ${style.bg} ${style.border} ${style.text}`}
                    >
                      {cell && cell.count > 0 ? cell.count : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-white">
              {active.day} &middot; {active.period}
            </span>
            <span className="text-slate-500">
              {' '}
              &mdash; {active.cell.count} alert{active.cell.count === 1 ? '' : 's'}
              {active.cell.cancellations > 0 ? `, ${active.cell.cancellations} cancelled` : ''}, ~
              {Math.round(active.cell.avgImpact)}m avg impact
            </span>
          </div>
          <button onClick={() => setActive(null)} className="text-slate-500 hover:text-white text-xs font-bold px-2">
            &times;
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 mt-4">
        <span className="text-[10px] text-slate-500 font-medium">Fewer</span>
        {[0, 1, 2, 3, 4].map((b) => (
          <div key={b} className={`w-4 h-4 rounded border ${BUCKET_STYLE[b].bg} ${BUCKET_STYLE[b].border}`} />
        ))}
        <span className="text-[10px] text-slate-500 font-medium">More/worse</span>
      </div>
    </div>
  );
}
