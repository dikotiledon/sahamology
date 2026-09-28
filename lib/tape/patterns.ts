import type { OhlcBar } from './ohlc';

export type PatternName = 'spring' | 'higher_low' | 'break_prior_high';

export interface PatternArgs {
  bar: OhlcBar;
  prev: OhlcBar;
  /** rataRataBandar from the signal row — the accumulation level proxy. */
  bandar: number;
  atr: number;
  ema20: number;
  sameBandarStreak: boolean;
}

export interface PatternResult {
  spring: boolean;
  higherLow: boolean;
  breakPriorHigh: boolean;
  name: PatternName | null;
}

/**
 * The G4 allow-list. Exactly three patterns; no candlesticks.
 *
 * P1 spring: low pierces bandar by at most 1×ATR and the bar closes back
 * at/above bandar (a shakeout, not a breakdown).
 * P2 higher low: same-bandar streak (today + ≥1 prior print) and low > prev.low.
 * P3 break of prior high: close > prev.high AND close ≥ EMA20 — a reclaim,
 * not a wick, and not a bounce that is still under the 20-EMA.
 */
export function detectPatterns(args: PatternArgs): PatternResult {
  const { bar, prev, bandar, atr, ema20, sameBandarStreak } = args;

  const spring =
    bar.low <= bandar && bar.low >= bandar - atr && bar.close >= bandar;

  const higherLow = sameBandarStreak && bar.low > prev.low;

  const breakPriorHigh = bar.close > prev.high && bar.close >= ema20;

  const name: PatternName | null = spring
    ? 'spring'
    : higherLow
      ? 'higher_low'
      : breakPriorHigh
        ? 'break_prior_high'
        : null;

  return { spring, higherLow, breakPriorHigh, name };
}
