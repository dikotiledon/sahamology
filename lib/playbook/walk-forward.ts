/**
 * Chronological IS/purge/OOS split for the walk-forward reporter.
 *
 * Follows plan §5.9 exactly:
 *   cut  = date at 80% of unique from_date values
 *   IS   = from_date <= cut
 *   OOS  = from_date >= addTradingDays(cut, +5)   // N=5 purge
 *   gap  = cut < from_date < OOS start            // excluded
 *
 * The purge is measured in trading days (via addTradingDays), not in positions.
 */

import { addTradingDays, nextTradingDay } from '../market-calendar';

export interface ChronologicalSplit {
  cut: string | null;
  is: string[];
  purged: string[];
  oos: string[];
}

/**
 * The exact trading-day sessions that must exist on disk for a signal to have
 * a complete N-session forward path (plan §5.9). Returned in session order.
 */
export function horizonSessions(signalDate: string, horizon: number): string[] {
  const sessions: string[] = [];
  let cursor = signalDate;
  for (let i = 0; i < horizon; i += 1) {
    cursor = nextTradingDay(cursor);
    sessions.push(cursor);
  }
  return sessions;
}

/**
 * Plan §5.9: a signal is scoreable only when its full N-session forward path
 * can be loaded. A truncated tail (e.g. today's signal whose horizon has not
 * elapsed) is unscored — never a fabricated "expiry" exit at the last
 * available close.
 */
export function isCompleteHorizon(
  signalDate: string,
  barDates: string[],
  horizon: number
): boolean {
  const required = horizonSessions(signalDate, horizon);
  const present = new Set(barDates);
  return required.every((d) => present.has(d));
}

export function splitChronological(
  dates: string[],
  opts: { isFraction: number; purgeSessions: number }
): ChronologicalSplit {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return { cut: null, is: [], purged: [], oos: [] };

  const cutIndex = Math.max(0, Math.floor(unique.length * opts.isFraction) - 1);
  const cut = unique[cutIndex];
  const oosStart = addTradingDays(cut, opts.purgeSessions);

  const is = unique.filter((d) => d <= cut);
  const oos = unique.filter((d) => d >= oosStart);
  const purged = unique.filter((d) => d > cut && d < oosStart);

  return { cut, is, purged, oos };
}
