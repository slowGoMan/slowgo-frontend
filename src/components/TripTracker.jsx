import { ArrowUp, ArrowDown, TrendingUp, XCircle } from 'lucide-react';
import { BUCKET_STYLE } from '../lib/heatmap';
import { buildTripGroups, delaySeverityBucket } from '../lib/trips';
import { directionLabel } from '../lib/constants';

function formatTime(scheduledTime) {
  return scheduledTime ? scheduledTime.slice(0, 5) : '--:--';
}

function TripCard({ trip }) {
  const DirIcon = trip.direction === 'Northbound' ? ArrowUp : trip.direction === 'Southbound' ? ArrowDown : null;

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {DirIcon && <DirIcon className="w-4 h-4 text-slate-500 shrink-0" />}
          <span className="text-sm font-bold text-white truncate">
            {trip.firstStation} <span className="text-slate-600">&rarr;</span> {trip.lastStation}
          </span>
        </div>
        {trip.isCancelled ? (
          <span className="shrink-0 flex items-center gap-1 text-[10px] font-black uppercase px-2 py-1 rounded-md border bg-rose-500/20 text-rose-300 border-rose-500/40">
            <XCircle className="w-3 h-3" /> Cancelled
          </span>
        ) : (
          <span className="shrink-0 text-[10px] font-black uppercase px-2 py-1 rounded-md border bg-amber-500/20 text-amber-300 border-amber-500/40">
            Peak +{trip.peakDelayMins}m
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-500 font-medium mb-3">
        <span>
          {trip.serviceDate} {trip.direction ? `· ${directionLabel(trip.direction)}` : ''}
        </span>
        <span className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" /> {trip.observations.length} stations reporting
        </span>
      </div>

      <div className="relative pl-1">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-800" />
        <div className="space-y-2.5">
          {trip.observations.map((o, i) => {
            const bucket = delaySeverityBucket(o.max_delay_mins || 0, o.is_cancellation);
            const style = BUCKET_STYLE[bucket];
            return (
              <div key={o.id ?? i} className="relative flex items-center gap-3 pl-5">
                <span className={`absolute left-0 w-3.5 h-3.5 rounded-full border-2 bg-slate-950 ${style.border}`} />
                <span className="text-xs font-semibold text-slate-200 flex-1 truncate">{o.affected_stations?.[0]}</span>
                <span className="text-[11px] text-slate-500 font-medium tabular-nums">{formatTime(o.scheduled_time)}</span>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border shrink-0 ${style.bg} ${style.border} ${style.text}`}
                >
                  {o.is_cancellation ? 'Cancelled' : `+${o.max_delay_mins || 0}m`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TripTracker({ alerts }) {
  const trips = buildTripGroups(alerts);

  if (trips.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-1">Tracked Trips</h3>
      <p className="text-[11px] text-slate-500 mb-4">
        Individual trains seen from multiple stations, worst first &mdash; the delay progression a single email can&apos;t
        show.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {trips.map((trip) => (
          <TripCard key={trip.tripId} trip={trip} />
        ))}
      </div>
    </div>
  );
}
