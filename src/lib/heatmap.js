// Aggregation helpers for the delay heatmaps (day x commute-period grid, and
// the recent-days calendar strip). Both boil down to the same idea: bucket
// alerts into cells, score each cell by accumulated delay "impact minutes",
// then bucket the scores into 5 quantile-based severity levels so the color
// scale stays meaningful whether there are 5 alerts logged or 5,000.

const CANCELLATION_IMPACT_MINS = 45; // a cancellation costs roughly a full headway wait

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const PERIODS = [
  { id: 'AM_PEAK', label: 'AM Peak' },
  { id: 'MIDDAY', label: 'Midday' },
  { id: 'PM_PEAK', label: 'PM Peak' },
  { id: 'EVENING', label: 'Evening' },
  { id: 'WEEKEND', label: 'Weekend' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function impactMinutes(alert) {
  return alert.is_cancellation ? CANCELLATION_IMPACT_MINS : alert.max_delay_mins || 0;
}

// Parse a 'YYYY-MM-DD' service_date as a local date (avoids the UTC-midnight
// shift you'd get from `new Date('2026-08-27')` in a negative-offset timezone).
export function parseServiceDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mondayIndex(date) {
  return (date.getDay() + 6) % 7; // 0 = Mon ... 6 = Sun
}

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

// Returns a function that maps a raw score to a severity bucket 1-4 based on
// the quartiles of the observed (non-zero) scores. Empty input always yields bucket 1.
export function makeBucketizer(scores) {
  const sorted = [...scores].sort((a, b) => a - b);
  const q25 = quantile(sorted, 0.25);
  const q50 = quantile(sorted, 0.5);
  const q75 = quantile(sorted, 0.75);
  return (score) => {
    if (score <= q25) return 1;
    if (score <= q50) return 2;
    if (score <= q75) return 3;
    return 4;
  };
}

export const BUCKET_STYLE = {
  0: { bg: 'bg-slate-800/30', border: 'border-slate-800', text: 'text-slate-600' },
  1: { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-slate-300' },
  2: { bg: 'bg-rose-500/30', border: 'border-rose-500/40', text: 'text-slate-100' },
  3: { bg: 'bg-rose-500/50', border: 'border-rose-500/60', text: 'text-slate-100' },
  4: { bg: 'bg-rose-500/75', border: 'border-rose-500', text: 'text-white' },
};

// --- Day-of-week x commute-period grid ---------------------------------

export function buildPeriodGrid(alerts) {
  const grid = WEEKDAYS.map(() =>
    Object.fromEntries(PERIODS.map((p) => [p.id, { count: 0, totalImpact: 0, cancellations: 0 }]))
  );

  let minDate = null;
  let maxDate = null;

  for (const a of alerts) {
    if (!a.service_date || !grid[0][a.commute_period]) continue;
    if (!minDate || a.service_date < minDate) minDate = a.service_date;
    if (!maxDate || a.service_date > maxDate) maxDate = a.service_date;

    const weekday = mondayIndex(parseServiceDate(a.service_date));
    const cell = grid[weekday][a.commute_period];
    cell.count += 1;
    cell.totalImpact += impactMinutes(a);
    if (a.is_cancellation) cell.cancellations += 1;
  }

  const numWeeks =
    minDate && maxDate
      ? Math.max(1, (parseServiceDate(maxDate) - parseServiceDate(minDate)) / (DAY_MS * 7) + 1 / 7)
      : 1;

  const cells = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (const period of PERIODS) {
      const raw = grid[weekday][period.id];
      cells.push({
        weekday,
        period: period.id,
        count: raw.count,
        totalImpact: raw.totalImpact,
        cancellations: raw.cancellations,
        perWeek: raw.totalImpact / numWeeks,
        avgImpact: raw.count > 0 ? raw.totalImpact / raw.count : 0,
      });
    }
  }

  const bucketize = makeBucketizer(cells.filter((c) => c.count > 0).map((c) => c.perWeek));
  for (const cell of cells) {
    cell.bucket = cell.count === 0 ? 0 : bucketize(cell.perWeek);
  }

  return cells;
}

// --- Recent-days calendar strip -----------------------------------------

export function calendarWindowDays(timeFilter) {
  switch (timeFilter) {
    case '24h':
    case '7d':
      return 7;
    case '30d':
      return 30;
    default:
      return 84; // ~12 weeks for 'all'
  }
}

export function buildCalendarWeeks(alerts, timeFilter) {
  const dayStats = new Map();
  for (const a of alerts) {
    if (!a.service_date) continue;
    if (!dayStats.has(a.service_date)) dayStats.set(a.service_date, { count: 0, totalImpact: 0, cancellations: 0 });
    const d = dayStats.get(a.service_date);
    d.count += 1;
    d.totalImpact += impactMinutes(a);
    if (a.is_cancellation) d.cancellations += 1;
  }

  const days = calendarWindowDays(timeFilter);
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const gridStart = new Date(start);
  gridStart.setDate(gridStart.getDate() - mondayIndex(gridStart));

  const allDays = [];
  const cursor = new Date(gridStart);
  while (cursor <= end) {
    const dateStr = formatYMD(cursor);
    const inRange = cursor >= start && cursor <= end;
    const stats = dayStats.get(dateStr);
    allDays.push({
      date: dateStr,
      weekday: mondayIndex(cursor),
      inRange,
      count: stats?.count || 0,
      totalImpact: stats?.totalImpact || 0,
      cancellations: stats?.cancellations || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const bucketize = makeBucketizer(allDays.filter((d) => d.inRange && d.count > 0).map((d) => d.totalImpact));
  for (const day of allDays) {
    day.bucket = !day.inRange || day.count === 0 ? 0 : bucketize(day.totalImpact);
  }

  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));
  return weeks;
}
