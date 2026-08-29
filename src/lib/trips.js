// Groups observations by the GTFS-resolved trip_id into a single train's
// delay progression across stations - the payoff for the resolver: "6 min
// at Aurora, 12 min by Bradford" instead of isolated per-station pings.

// Fixed magnitude thresholds, not quantile-based like the heatmap's
// bucketing: a single observation's delay in minutes is a meaningful
// absolute number on its own (0/15/30 min already carry real meaning here -
// 15 is this dataset's own refund-eligibility line), unlike a heatmap cell's
// aggregate score, which only makes sense relative to the rest of the data.
export function delaySeverityBucket(mins, isCancellation) {
  if (isCancellation || mins >= 30) return 4;
  if (mins >= 15) return 3;
  if (mins >= 5) return 2;
  if (mins > 0) return 1;
  return 0;
}

function sortKey(o) {
  return `${o.scheduled_time || ''}|${o.received_at || ''}`;
}

// Only trips with 2+ observations are worth showing - a single reading has
// no progression to visualize (it's just the incident feed).
export function buildTripGroups(alerts) {
  const byTrip = new Map();
  for (const a of alerts) {
    if (!a.trip_id) continue;
    if (!byTrip.has(a.trip_id)) byTrip.set(a.trip_id, []);
    byTrip.get(a.trip_id).push(a);
  }

  const groups = [];
  for (const [tripId, obs] of byTrip) {
    if (obs.length < 2) continue;
    const sorted = [...obs].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const isCancelled = sorted.some((o) => o.is_cancellation);
    const peakDelayMins = Math.max(0, ...sorted.map((o) => o.max_delay_mins || 0));

    groups.push({
      tripId,
      observations: sorted,
      direction: sorted.find((o) => o.direction)?.direction || null,
      serviceDate: sorted[0]?.service_date || null,
      isCancelled,
      peakDelayMins,
      firstStation: sorted[0]?.affected_stations?.[0] || null,
      lastStation: sorted[sorted.length - 1]?.affected_stations?.[0] || null,
    });
  }

  // Worst first: a cancellation outranks any delay figure, then by how bad
  // the peak delay got, then by cascade size (more stations touched).
  groups.sort((a, b) => {
    if (a.isCancelled !== b.isCancelled) return a.isCancelled ? -1 : 1;
    if (b.peakDelayMins !== a.peakDelayMins) return b.peakDelayMins - a.peakDelayMins;
    return b.observations.length - a.observations.length;
  });

  return groups;
}
