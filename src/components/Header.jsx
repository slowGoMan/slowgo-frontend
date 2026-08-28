import { RefreshCw } from 'lucide-react';
import Logo from './Logo';

export default function Header({ activeCount, loading, onRefresh }) {
  const allClear = activeCount === 0;

  return (
    <header className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800">
      <div className="flex items-center gap-3">
        <div className="bg-emerald-500/20 p-2.5 rounded-2xl border border-emerald-500/40">
          <Logo className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            SLOWGO<span className="text-emerald-400">.CA</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium tracking-wide">
            BARRIE LINE DELAY HEATMAP &amp; HISTORICAL TRACKER
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wide ${
            allClear
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${allClear ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'}`} />
          {allClear ? 'All Clear Today' : `${activeCount} Active Today`}
        </div>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
}
