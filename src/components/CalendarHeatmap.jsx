import { useState } from 'react';
import { BUCKET_STYLE, parseServiceDate } from '../lib/heatmap';

const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabelFor(week) {
  const firstInRange = week.find((d) => d.inRange);
  if (!firstInRange) return '';
  const date = parseServiceDate(firstInRange.date);
  return date.getDate() <= 7 ? MONTH_LABELS[date.getMonth()] : '';
}

export default function CalendarHeatmap({ weeks }) {
  const [active, setActive] = useState(null);

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">Recent Days</h3>
      <p className="text-[11px] text-slate-500 mb-4">Total delay impact per day</p>

      <div className="overflow-x-auto">
        <div className="flex gap-1 w-max">
          <div className="flex flex-col gap-1 mr-1 pt-4">
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} className="w-3.5 h-3.5 text-[8px] leading-[14px] font-bold text-slate-600">
                {label}
              </div>
            ))}
          </div>

          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              <div className="h-3 text-[9px] font-bold text-slate-500 whitespace-nowrap">{monthLabelFor(week)}</div>
              {week.map((day) => {
                const style = BUCKET_STYLE[day.bucket];
                const tooltip = day.inRange
                  ? `${day.date}\n${
                      day.count > 0
                        ? `${day.count} alert${day.count === 1 ? '' : 's'}${
                            day.cancellations > 0 ? `, ${day.cancellations} cancelled` : ''
                          }\n${Math.round(day.totalImpact)}m total impact`
                        : 'All clear'
                    }`
                  : undefined;
                return (
                  <button
                    key={day.date}
                    type="button"
                    title={tooltip}
                    disabled={!day.inRange}
                    onClick={() => setActive(day)}
                    className={`w-3.5 h-3.5 rounded-sm border transition-transform hover:scale-125 ${
                      day.inRange ? `${style.bg} ${style.border}` : 'bg-transparent border-transparent'
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {active && (
        <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between">
          <div className="text-xs text-slate-300">
            <span className="font-bold text-white">{active.date}</span>
            <span className="text-slate-500">
              {' '}
              &mdash;{' '}
              {active.count > 0
                ? `${active.count} alert${active.count === 1 ? '' : 's'}${
                    active.cancellations > 0 ? `, ${active.cancellations} cancelled` : ''
                  }, ${Math.round(active.totalImpact)}m total impact`
                : 'All clear'}
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
          <div key={b} className={`w-3.5 h-3.5 rounded-sm border ${BUCKET_STYLE[b].bg} ${BUCKET_STYLE[b].border}`} />
        ))}
        <span className="text-[10px] text-slate-500 font-medium">More/worse</span>
      </div>
    </div>
  );
}
