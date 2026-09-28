import { isUsableBar, type OhlcBar } from './ohlc';

export type { OhlcBar };

export const ATR_PERIOD = 14;

/**
 * Wilder true range for bar `i` given the previous close.
 * Comparison order matches TA-Lib: high-low, |prevClose-high|, |prevClose-low|.
 */
export function trueRange(prevClose: number, bar: OhlcBar): number {
  const a = bar.high - bar.low;
  const b = Math.abs(bar.high - prevClose);
  const c = Math.abs(bar.low - prevClose);
  return Math.max(a, b, c);
}

/**
 * Wilder ATR(period) over completed bars: SMA seed of the first `period` true
 * ranges, then Wilder recursion ATR = (prevATR*(period-1) + TR) / period.
 *
 * We deliberately do NOT skip TA-Lib's unstable period — the first finite
 * value is emitted once `period` true ranges exist (period+1 bars).
 * Returns null when there are not enough usable bars or any input is
 * non-finite.
 */
export function atrWilder(bars: OhlcBar[], period: number = ATR_PERIOD): number | null {
  if (!Number.isInteger(period) || period < 1) return null;

  const usable = bars.filter(isUsableBar);
  if (usable.length < period + 1) return null;

  let sum = 0;
  for (let i = 1; i <= period; i += 1) {
    const tr = trueRange(usable[i - 1].close, usable[i]);
    if (!Number.isFinite(tr)) return null;
    sum += tr;
  }

  let atr = sum / period;
  for (let i = period + 1; i < usable.length; i += 1) {
    const tr = trueRange(usable[i - 1].close, usable[i]);
    if (!Number.isFinite(tr)) return null;
    atr = (atr * (period - 1) + tr) / period;
  }

  return Number.isFinite(atr) ? atr : null;
}
