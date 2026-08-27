export function getStationMetrics(alerts, stationName) {
  const hits = alerts.filter(
    (a) =>
      a.affected_stations &&
      a.affected_stations.some((s) => s.toLowerCase().includes(stationName.toLowerCase()))
  );
  const totalDelay = hits.reduce((acc, curr) => acc + (curr.max_delay_mins || 0), 0);
  const cancellations = hits.filter((a) => a.is_cancellation).length;
  return { count: hits.length, totalDelay, cancellations };
}

export function nodeFill(metrics) {
  if (metrics.cancellations > 0 || metrics.count >= 5) return '#EF4444'; // rose-500
  if (metrics.count >= 2) return '#F59E0B'; // amber-500
  if (metrics.count >= 1) return '#FACC15'; // yellow-400, still worth a glance
  return '#10B981'; // emerald-500, all clear
}
