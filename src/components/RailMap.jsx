import { Flame } from 'lucide-react';
import { STATIONS, RAIL_PATH } from '../lib/stations';
import { getStationMetrics, nodeFill } from '../lib/metrics';

export default function RailMap({ alerts, selectedStation, onSelectStation }) {
  return (
    <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-3xl p-6 relative flex flex-col items-center shadow-xl backdrop-blur-md">
      <div className="w-full flex items-center justify-between mb-4">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Flame className="w-4 h-4 text-emerald-400" /> Live Corridor Vector
        </span>
        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
          Interactive Nodes
        </span>
      </div>

      <div className="w-full max-w-[340px] aspect-[1/2] relative">
        <svg viewBox="0 0 320 780" className="w-full h-full drop-shadow-2xl overflow-visible">
          <path
            d={RAIL_PATH}
            fill="none"
            stroke="#064e3b"
            strokeWidth="14"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.4"
          />
          <path
            d={RAIL_PATH}
            fill="none"
            stroke="#10b981"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={RAIL_PATH}
            fill="none"
            stroke="#022c22"
            strokeWidth="2.5"
            strokeDasharray="4 6"
            strokeLinecap="round"
          />

          {STATIONS.map((station) => {
            const metrics = getStationMetrics(alerts, station.name);
            const fillColor = nodeFill(metrics);
            const isSelected = selectedStation?.id === station.id;

            return (
              <g
                key={station.id}
                className="cursor-pointer group"
                onClick={() => onSelectStation(isSelected ? null : station)}
              >
                {isSelected && (
                  <circle cx={station.x} cy={station.y} r="16" fill={fillColor} opacity="0.3" className="animate-pulse" />
                )}

                <circle
                  cx={station.x}
                  cy={station.y}
                  r={station.isTerminal ? '10' : '8'}
                  fill="#0f172a"
                  stroke={fillColor}
                  strokeWidth="3.5"
                  className="transition-all duration-300 group-hover:scale-125"
                />

                <circle cx={station.x} cy={station.y} r="3.5" fill={fillColor} />

                <text
                  x={station.x < 200 ? station.x - 14 : station.x + 14}
                  y={station.y + 4}
                  textAnchor={station.x < 200 ? 'end' : 'start'}
                  className={`text-[10px] font-bold tracking-tight select-none transition-colors ${
                    isSelected ? 'fill-emerald-300 font-extrabold text-[11px]' : 'fill-slate-400 group-hover:fill-slate-100'
                  }`}
                >
                  {station.name}
                  {metrics.count > 0 ? ` (${metrics.count})` : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
