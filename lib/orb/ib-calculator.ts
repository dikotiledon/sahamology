import { IntradayBar, InitialBalanceLevels } from './types';

/**
 * Calculates Initial Balance levels (High, Low, Range, Midpoint, and Extensions)
 * from a slice of opening intraday bars.
 */
export function calculateInitialBalance(bars: IntradayBar[]): InitialBalanceLevels {
  if (bars.length === 0) {
    return {
      high: 0,
      low: 0,
      range: 0,
      midpoint: 0,
      extensionR1: 0,
      extensionR2: 0,
      extensionS1: 0,
      extensionS2: 0,
    };
  }

  let high = -Infinity;
  let low = Infinity;

  for (const bar of bars) {
    if (bar.high > high) high = bar.high;
    if (bar.low < low) low = bar.low;
  }

  // Handle flat or degenerate range
  if (low === Infinity || high === -Infinity || high <= 0 || low <= 0) {
    const fallbackPrice = bars[0].close || 0;
    return {
      high: fallbackPrice,
      low: fallbackPrice,
      range: 0,
      midpoint: fallbackPrice,
      extensionR1: fallbackPrice,
      extensionR2: fallbackPrice,
      extensionS1: fallbackPrice,
      extensionS2: fallbackPrice,
    };
  }

  const range = Number((high - low).toFixed(2));
  const midpoint = Number(((high + low) / 2).toFixed(2));
  const extensionR1 = Number((high + 0.5 * range).toFixed(2));
  const extensionR2 = Number((high + 1.0 * range).toFixed(2));
  const extensionS1 = Number((low - 0.5 * range).toFixed(2));
  const extensionS2 = Number((low - 1.0 * range).toFixed(2));

  return {
    high,
    low,
    range,
    midpoint,
    extensionR1,
    extensionR2,
    extensionS1,
    extensionS2,
  };
}

/**
 * Filters intraday bars up to a given cutoff time (e.g. "09:15" for IB15, "10:00" for IB60).
 */
export function extractIbBars(bars: IntradayBar[], cutoffTime: string): IntradayBar[] {
  return bars.filter((b) => b.time <= cutoffTime);
}
