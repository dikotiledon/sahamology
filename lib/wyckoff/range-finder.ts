import type { WyckoffBar, TradingRange } from './types';

export function detectTradingRange(bars: WyckoffBar[]): TradingRange | null {
  if (!bars || bars.length < 25) {
    return null;
  }

  // Use a window of 25 to 60 bars
  const windowBars = bars.length > 60 ? bars.slice(-60) : bars;
  const latestBar = windowBars[windowBars.length - 1];

  // For establishing the historical range baseline, look at bars preceding the latest bar
  // (to avoid a breakout bar artificially expanding the established Creek/Ice level)
  const baselineBars = windowBars.slice(0, -1);
  let iceSupport = Number.POSITIVE_INFINITY;
  let creekResistance = Number.NEGATIVE_INFINITY;

  for (const b of baselineBars) {
    if (b.low < iceSupport) iceSupport = b.low;
    if (b.high > creekResistance) creekResistance = b.high;
  }

  if (iceSupport <= 0 || !Number.isFinite(iceSupport) || !Number.isFinite(creekResistance)) {
    return null;
  }

  const rangeWidthPct = Math.round(((creekResistance - iceSupport) / iceSupport) * 10000) / 100;

  // Filter out unrealistically narrow (<4%) or volatile (>50%) non-ranges
  if (rangeWidthPct < 4 || rangeWidthPct > 50) {
    return null;
  }

  const midpoint = Math.round((iceSupport + creekResistance) / 2);

  let status: TradingRange['status'] = 'ACTIVE';
  if (latestBar.close > creekResistance * 1.02) {
    status = 'BROKEN_OUT_UP';
  } else if (latestBar.close < iceSupport * 0.98) {
    status = 'BROKEN_OUT_DOWN';
  }

  return {
    startDate: windowBars[0].date,
    endDate: latestBar.date,
    iceSupport,
    creekResistance,
    midpoint,
    rangeWidthPct,
    barCount: windowBars.length,
    status,
  };
}
