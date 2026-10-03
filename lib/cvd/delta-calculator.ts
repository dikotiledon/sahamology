import { PriceVolumeBar, BarDelta, CvdMetrics } from './types';

/**
 * Calculates a single-bar volume delta proxy using Close Location Value (CLV)
 * and Open-to-Close directional displacement.
 */
export function calculateBarDelta(bar: PriceVolumeBar): BarDelta {
  const range = bar.high - bar.low;

  if (range <= 0 || bar.volume <= 0) {
    return {
      date: bar.date,
      deltaVolume: 0,
      clv: 0,
      close: bar.close,
      volume: bar.volume,
    };
  }

  // Close Location Value (CLV): -1.0 (closed at low) to +1.0 (closed at high)
  const clv = Number(((2 * bar.close - (bar.high + bar.low)) / range).toFixed(4));

  // Open-to-Close displacement ratio: -1.0 to +1.0
  const displacement = Number(((bar.close - bar.open) / range).toFixed(4));

  // Volume Delta proxy with 60% CLV weight and 40% displacement weight
  const deltaFactor = 0.6 * clv + 0.4 * displacement;
  const deltaVolume = Math.round(bar.volume * deltaFactor);

  return {
    date: bar.date,
    deltaVolume,
    clv,
    close: bar.close,
    volume: bar.volume,
  };
}

/**
 * Calculates the full series of bar deltas for an array of price bars.
 */
export function calculateBarDeltas(bars: PriceVolumeBar[]): BarDelta[] {
  return bars.map(calculateBarDelta);
}

/**
 * Calculates 20-day and 50-day rolling Cumulative Volume Delta (CVD) metrics.
 */
export function calculateCvdMetrics(barDeltas: BarDelta[]): CvdMetrics {
  const count = barDeltas.length;

  if (count === 0) {
    return {
      cvd20d: 0,
      cvd50d: 0,
      deltaRatioPct: 0,
      currentBarDelta: 0,
      trend: 'NEUTRAL',
    };
  }

  const currentBarDelta = barDeltas[count - 1].deltaVolume;

  // 20-session rolling CVD
  const slice20 = barDeltas.slice(Math.max(0, count - 20));
  const cvd20d = slice20.reduce((sum, b) => sum + b.deltaVolume, 0);
  const vol20d = slice20.reduce((sum, b) => sum + b.volume, 0);

  // 50-session rolling CVD
  const slice50 = barDeltas.slice(Math.max(0, count - 50));
  const cvd50d = slice50.reduce((sum, b) => sum + b.deltaVolume, 0);

  const deltaRatioPct =
    vol20d > 0 ? Number(((cvd20d / vol20d) * 100).toFixed(2)) : 0;

  let trend: CvdMetrics['trend'] = 'NEUTRAL';
  if (deltaRatioPct >= 12.0) {
    trend = 'ACCUMULATING';
  } else if (deltaRatioPct <= -12.0) {
    trend = 'DISTRIBUTING';
  }

  return {
    cvd20d,
    cvd50d,
    deltaRatioPct,
    currentBarDelta,
    trend,
  };
}
