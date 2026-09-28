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

import { addTradingDays } from '../market-calendar';

export interface ChronologicalSplit {
  cut: string | null;
  is: string[];
  purged: string[];
  oos: string[];
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
