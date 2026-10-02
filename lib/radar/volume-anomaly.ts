import type { VolumeAnomalyMetrics } from './types';

export interface PriceBar {
  date?: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number;
  volume: number;
}

/**
 * Calculates volume anomaly and price volatility decoupling metrics.
 *
 * Implements Metric 3 of IDX Insider Accumulation:
 * - Decoupling Ratio: High volume surge (3x to 10x 50-day average)
 * - Volatility Compression: Narrow true range / compressed price volatility (< 1.0 of baseline ATR)
 * - Identifies "Silent Accumulation" by institutional players using iceberg orders
 *   before public disclosure.
 */
export function calculateVolumeAnomaly(
  bars: PriceBar[],
  minBaselineSessions: number = 20,
  targetBaselineSessions: number = 50
): VolumeAnomalyMetrics {
  if (!bars || bars.length < 2) {
    return {
      currentVolume: bars?.[0]?.volume ?? 0,
      volumeSma50: 0,
      volumeRatioToSma50: 0,
      priceVolatilityRatio: 1.0,
      isSilentAccumulation: false,
    };
  }

  const currentBar = bars[bars.length - 1];
  const historicalBars = bars.slice(0, bars.length - 1);

  // Take the most recent historical bars up to targetBaselineSessions
  const baselineSlice = historicalBars.slice(-targetBaselineSessions);
  if (baselineSlice.length < minBaselineSessions) {
    return {
      currentVolume: currentBar.volume,
      volumeSma50: 0,
      volumeRatioToSma50: 0,
      priceVolatilityRatio: 1.0,
      isSilentAccumulation: false,
    };
  }

  // Calculate 50-day SMA volume
  const validVolumes = baselineSlice.map((b) => b.volume).filter((v) => Number.isFinite(v) && v >= 0);
  const volumeSma50 =
    validVolumes.length > 0 ? validVolumes.reduce((sum, v) => sum + v, 0) / validVolumes.length : 0;

  const currentVolume = currentBar.volume || 0;
  const volumeRatioToSma50 = volumeSma50 > 0 ? currentVolume / volumeSma50 : 0;

  // Calculate current True Range
  const prevBar = historicalBars[historicalBars.length - 1];
  const prevClose = prevBar.close;
  const high = currentBar.high ?? currentBar.close;
  const low = currentBar.low ?? currentBar.close;

  const currentTr = Math.max(
    high - low,
    Math.abs(high - prevClose),
    Math.abs(low - prevClose)
  );

  // Calculate historical baseline ATR
  const historicalTrs: number[] = [];
  for (let i = 1; i < baselineSlice.length; i++) {
    const b = baselineSlice[i];
    const prev = baselineSlice[i - 1];
    const bHigh = b.high ?? b.close;
    const bLow = b.low ?? b.close;
    const tr = Math.max(bHigh - bLow, Math.abs(bHigh - prev.close), Math.abs(bLow - prev.close));
    if (Number.isFinite(tr) && tr >= 0) {
      historicalTrs.push(tr);
    }
  }

  const baselineAtr =
    historicalTrs.length > 0
      ? historicalTrs.reduce((sum, tr) => sum + tr, 0) / historicalTrs.length
      : 0;

  const priceVolatilityRatio = baselineAtr > 0 ? currentTr / baselineAtr : 1.0;

  // Silent accumulation signature:
  // Volume >= 3.0x 50-day average while price volatility ratio < 1.0 (or volume >= 2.5x with volatility < 0.8)
  const isSilentAccumulation =
    (volumeRatioToSma50 >= 3.0 && priceVolatilityRatio < 1.0) ||
    (volumeRatioToSma50 >= 2.5 && priceVolatilityRatio <= 0.8);

  return {
    currentVolume,
    volumeSma50: Number(volumeSma50.toFixed(2)),
    volumeRatioToSma50: Number(volumeRatioToSma50.toFixed(4)),
    priceVolatilityRatio: Number(priceVolatilityRatio.toFixed(4)),
    isSilentAccumulation,
  };
}
