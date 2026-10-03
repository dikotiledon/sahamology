import type { WyckoffBar, VsaMetrics } from './types';

export function calculateBarSpread(bar: WyckoffBar): number {
  return Math.max(0, bar.high - bar.low);
}

export function calculateClosePosition(bar: WyckoffBar): number {
  const range = bar.high - bar.low;
  if (range <= 0) return 0.5;
  const pos = (bar.close - bar.low) / range;
  return Math.min(1.0, Math.max(0.0, Math.round(pos * 1000) / 1000));
}

export function calculateVsaMetrics(bars: WyckoffBar[], targetIndex: number): VsaMetrics {
  if (targetIndex < 0 || targetIndex >= bars.length) {
    throw new Error(`Target index ${targetIndex} out of bounds for bars length ${bars.length}`);
  }

  const currentBar = bars[targetIndex];
  const spread = calculateBarSpread(currentBar);
  const volume = currentBar.volume;
  const closePosition = calculateClosePosition(currentBar);

  // Look back up to 20 bars strictly preceding or ending at targetIndex - 1 (or including if window < 20)
  const windowSize = 20;
  const startIdx = Math.max(0, targetIndex - windowSize);
  const lookbackBars = bars.slice(startIdx, targetIndex);

  let smaSpread20: number;
  let smaVolume20: number;

  if (lookbackBars.length > 0) {
    const totalSpread = lookbackBars.reduce((acc, b) => acc + calculateBarSpread(b), 0);
    const totalVolume = lookbackBars.reduce((acc, b) => acc + b.volume, 0);
    smaSpread20 = totalSpread / lookbackBars.length;
    smaVolume20 = totalVolume / lookbackBars.length;
  } else {
    smaSpread20 = spread || 1;
    smaVolume20 = volume || 1;
  }

  const relativeSpread = smaSpread20 > 0 ? Math.round((spread / smaSpread20) * 100) / 100 : 1.0;
  const relativeVolume = smaVolume20 > 0 ? Math.round((volume / smaVolume20) * 100) / 100 : 1.0;

  return {
    spread,
    smaSpread20: Math.round(smaSpread20 * 100) / 100,
    relativeSpread,
    volume,
    smaVolume20: Math.round(smaVolume20),
    relativeVolume,
    closePosition,
    isWideSpread: relativeSpread >= 1.5,
    isNarrowSpread: relativeSpread <= 0.75,
    isHighVolume: relativeVolume >= 1.8,
    isUltraHighVolume: relativeVolume >= 2.5,
    isLowVolume: relativeVolume <= 0.75,
  };
}
