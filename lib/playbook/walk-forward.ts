/**
 * Chronological IS/purge/OOS split for the walk-forward reporter.
 *
 * The split is position-based over the sorted unique signal dates: `is` keeps
 * the first `isFraction` (80%) of sessions, then `purgeSessions` sessions are
 * dropped as the purge gap, and the remainder is OOS. Signal-session positions
 * are a deterministic proxy for trading days that needs no calendar; the
 * reporter script uses addTradingDays for actual bar-path windows.
 */

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

  const isCount = Math.max(1, Math.floor(unique.length * opts.isFraction));
  const cutIndex = isCount - 1;
  const oosStartIndex = cutIndex + 1 + opts.purgeSessions;

  return {
    cut: unique[cutIndex],
    is: unique.slice(0, isCount),
    purged: unique.slice(cutIndex + 1, oosStartIndex),
    oos: unique.slice(oosStartIndex),
  };
}
