/** A completed price bar used for N=5 path simulation. */
export interface PathBar {
  date: string;
  high: number;
  low: number;
  close: number;
}

export type PathExit = 'invalidation' | 'max' | 'r1' | 'expiry';

export interface ScoredPath {
  unscored: false;
  exit: PathExit;
  exitPrice: number;
  daysHeld: number;
  pnl: number;
  pnlAfterCosts: number;
  rMultiple: number;
  touchR1: boolean;
}

export interface UnscoredPath {
  unscored: true;
}

export type PathResult = ScoredPath | UnscoredPath;

/**
 * Canonical path-outcome scorer (§5.8). First touch wins, with conservative
 * same-bar sequencing: stop is checked before max before r1. Expiry exits at
 * the last bar's close. Empty path, non-positive risk, or zero bars are
 * unscored — never a fake 0R win.
 */
export function scorePath(args: {
  entry: number;
  r1: number;
  max: number;
  invalidation: number;
  costRate: number;
  bars: PathBar[];
}): PathResult {
  const { entry, r1, max, invalidation, costRate, bars } = args;
  const risk = entry - invalidation;
  if (bars.length === 0 || !(risk > 0)) return { unscored: true };

  let exit: PathExit = 'expiry';
  let exitPrice = bars[bars.length - 1].close;
  let daysHeld = bars.length;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar.low <= invalidation) {
      exit = 'invalidation';
      exitPrice = invalidation;
      daysHeld = i + 1;
      break;
    }
    if (bar.high >= max) {
      exit = 'max';
      exitPrice = max;
      daysHeld = i + 1;
      break;
    }
    if (bar.high >= r1) {
      exit = 'r1';
      exitPrice = r1;
      daysHeld = i + 1;
      break;
    }
  }

  const pnl = exitPrice - entry;
  const pnlAfterCosts = pnl - (entry + exitPrice) * costRate;
  const rMultiple = pnlAfterCosts / risk;
  const touchR1 = bars.some((bar) => bar.high >= r1);

  return { unscored: false, exit, exitPrice, daysHeld, pnl, pnlAfterCosts, rMultiple, touchR1 };
}
