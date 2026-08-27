import { useEffect, useMemo, useState } from 'react';
import { supabase, TABLE } from './lib/supabase';
import { isRushHour } from './lib/constants';
import Header from './components/Header';
import Filters from './components/Filters';
import RailMap from './components/RailMap';
import StatsBar from './components/StatsBar';
import IncidentFeed from './components/IncidentFeed';
import Heatmap from './components/Heatmap';

export default function App() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [timeFilter, setTimeFilter] = useState('7d');
  const [rushHourOnly, setRushHourOnly] = useState(false);
  const [reasonFilter, setReasonFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [selectedStation, setSelectedStation] = useState(null);

  useEffect(() => {
    fetchAlerts();
  }, [timeFilter]);

  async function fetchAlerts() {
    setLoading(true);
    setError(null);

    let query = supabase.from(TABLE).select('*').order('received_at', { ascending: false });

    const now = new Date();
    if (timeFilter === '24h') {
      query = query.gte('received_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    } else if (timeFilter === '7d') {
      query = query.gte('received_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
    } else if (timeFilter === '30d') {
      query = query.gte('received_at', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString());
    }

    const { data, error: fetchError } = await query;
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAlerts(data || []);
    }
    setLoading(false);
  }

  const directions = useMemo(() => {
    const set = new Set(alerts.map((a) => a.direction).filter(Boolean));
    return Array.from(set).sort();
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (rushHourOnly && !isRushHour(a.commute_period)) return false;
      if (reasonFilter !== 'all' && a.incident_type !== reasonFilter) return false;
      if (directionFilter !== 'all' && a.direction !== directionFilter) return false;
      return true;
    });
  }, [alerts, rushHourOnly, reasonFilter, directionFilter]);

  const feedAlerts = useMemo(() => {
    if (!selectedStation) return filteredAlerts;
    return filteredAlerts.filter((a) =>
      a.affected_stations?.some((s) => s.toLowerCase().includes(selectedStation.name.toLowerCase()))
    );
  }, [filteredAlerts, selectedStation]);

  const activeToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return alerts.filter((a) => a.service_date === today && a.status !== 'resolved').length;
  }, [alerts]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <Header activeCount={activeToday} loading={loading} onRefresh={fetchAlerts} />

      <Filters
        timeFilter={timeFilter}
        setTimeFilter={setTimeFilter}
        rushHourOnly={rushHourOnly}
        setRushHourOnly={setRushHourOnly}
        reasonFilter={reasonFilter}
        setReasonFilter={setReasonFilter}
        directionFilter={directionFilter}
        setDirectionFilter={setDirectionFilter}
        directions={directions}
      />

      {error && (
        <div className="max-w-7xl mx-auto mt-4 bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm px-4 py-3 rounded-xl">
          Couldn&apos;t load data: {error}
        </div>
      )}

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6">
        <RailMap alerts={filteredAlerts} selectedStation={selectedStation} onSelectStation={setSelectedStation} />

        <div className="lg:col-span-7 flex flex-col gap-6">
          <StatsBar alerts={filteredAlerts} />
          <IncidentFeed
            alerts={feedAlerts}
            selectedStation={selectedStation}
            onClearStation={() => setSelectedStation(null)}
            loading={loading}
          />
        </div>
      </main>

      <section className="max-w-7xl mx-auto mt-6">
        <Heatmap alerts={filteredAlerts} timeFilter={timeFilter} />
      </section>
    </div>
  );
}
