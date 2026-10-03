import { DailyPriceBar, WeeklyBar } from './types';

/**
 * Computes an ISO week string "YYYY-Www" for a given "YYYY-MM-DD" date.
 */
export function getIsoWeekKey(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Aggregates sequential daily price bars into calendar weekly bars.
 */
export function aggregateWeeklyBars(dailyBars: DailyPriceBar[]): WeeklyBar[] {
  if (dailyBars.length === 0) return [];

  // Sort daily bars chronologically ascending
  const sorted = [...dailyBars].sort((a, b) => a.date.localeCompare(b.date));

  const weekMap = new Map<string, DailyPriceBar[]>();

  for (const bar of sorted) {
    if (!bar.date || isNaN(bar.close) || bar.close <= 0) continue;
    const weekKey = getIsoWeekKey(bar.date);
    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, []);
    }
    weekMap.get(weekKey)!.push(bar);
  }

  const weeklyBars: WeeklyBar[] = [];

  for (const [weekKey, bars] of weekMap.entries()) {
    if (bars.length === 0) continue;

    const open = bars[0].open;
    const close = bars[bars.length - 1].close;
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;

    for (const b of bars) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volume += b.volume || 0;
    }

    weeklyBars.push({
      weekKey,
      startDate: bars[0].date,
      endDate: bars[bars.length - 1].date,
      open,
      high,
      low,
      close,
      volume,
    });
  }

  // Ensure weekly bars are sorted chronologically
  return weeklyBars.sort((a, b) => a.startDate.localeCompare(b.startDate));
}
