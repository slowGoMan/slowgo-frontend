import { AlertTriangle, CheckCircle2, Clock, XCircle, Info, Wrench } from 'lucide-react';
import { incidentTypeLabel, directionLabel } from '../lib/constants';

const STATUS_STYLE = {
  cancelled: { icon: XCircle, badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30', chip: 'bg-rose-500/20 text-rose-400' },
  delayed: { icon: AlertTriangle, badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', chip: 'bg-amber-500/20 text-amber-400' },
  modified: { icon: Wrench, badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30', chip: 'bg-sky-500/20 text-sky-400' },
  advisory: { icon: Info, badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30', chip: 'bg-slate-500/20 text-slate-400' },
  resolved: { icon: CheckCircle2, badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', chip: 'bg-emerald-500/20 text-emerald-400' },
};

function statusLabel(incident) {
  if (incident.is_cancellation) return 'Cancelled';
  if (incident.max_delay_mins) return `+${incident.max_delay_mins} min delay`;
  if (incident.status) return incident.status[0].toUpperCase() + incident.status.slice(1);
  return 'Advisory';
}

function formatAdvisoryType(advisoryType) {
  return advisoryType
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function formatTime(incident) {
  if (incident.scheduled_time) return incident.scheduled_time.slice(0, 5);
  return new Date(incident.received_at || incident.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function IncidentFeed({ alerts, loading }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 flex-1 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400" /> Incident Timeline
        </h3>
      </div>

      <div className="space-y-3 overflow-y-auto max-h-[500px] pr-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-sm">Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <CheckCircle2 className="w-10 h-10 mb-2 text-emerald-500/50" />
            <p className="text-sm">All clear! No delays recorded for this filter.</p>
          </div>
        ) : (
          alerts.map((incident) => {
            const style = STATUS_STYLE[incident.status] || STATUS_STYLE.delayed;
            const Icon = style.icon;

            return (
              <div
                key={incident.id}
                className="bg-slate-800/40 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition-all flex items-start gap-3.5"
              >
                <div className={`${style.chip} p-2 rounded-xl mt-0.5`}>
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${style.badge}`}>
                      {statusLabel(incident)}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                      {formatTime(incident)}
                      {incident.direction ? ` ${directionLabel(incident.direction)}` : ''}
                    </span>
                  </div>

                  <p className="text-sm font-semibold text-slate-200 mt-1.5">{incident.summary || incident.subject}</p>

                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded-md border border-slate-800">
                      Reason: {incidentTypeLabel(incident.incident_type)}
                    </span>
                    {incident.affected_stations?.length > 0 && (
                      <span className="text-[10px] bg-slate-900 text-slate-400 px-2 py-0.5 rounded-md border border-slate-800">
                        {incident.affected_stations.join(', ')}
                      </span>
                    )}
                    {incident.eligible_for_refund && (
                      <span className="text-[10px] bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-800/60">
                        Refund Eligible
                      </span>
                    )}
                    {incident.advisory_type && (
                      <span className="text-[10px] bg-sky-900/40 text-sky-300 px-2 py-0.5 rounded-md border border-sky-800/60">
                        {formatAdvisoryType(incident.advisory_type)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
