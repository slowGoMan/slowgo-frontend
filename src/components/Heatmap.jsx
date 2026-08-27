import { buildPeriodGrid, buildCalendarWeeks } from '../lib/heatmap';
import PeriodHeatmap from './PeriodHeatmap';
import CalendarHeatmap from './CalendarHeatmap';

export default function Heatmap({ alerts, timeFilter }) {
  const periodCells = buildPeriodGrid(alerts);
  const calendarWeeks = buildCalendarWeeks(alerts, timeFilter);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <PeriodHeatmap cells={periodCells} />
      <CalendarHeatmap weeks={calendarWeeks} />
    </div>
  );
}
