import type { VwapPriceBar, VwapAnchorMetric } from './types';

/**
 * Calculates Anchored VWAP and Volume-Weighted Standard Deviation bands
 * starting from a specific bar index `anchorIndex` to the end of the `bars` array.
 */
export function calculateAvwapFromIndex(
  bars: VwapPriceBar[],
  anchorIndex: number,
  anchorName: string
): VwapAnchorMetric | null {
  if (!bars || bars.length === 0 || anchorIndex < 0 || anchorIndex >= bars.length) {
    return null;
  }

  let cumulativePv = 0;
  let cumulativeVolume = 0;
  const sampleBars = bars.length - anchorIndex;

  // 1. Pass 1: Cumulative VWAP
  for (let i = anchorIndex; i < bars.length; i++) {
    const b = bars[i];
    const typicalPrice = (b.high + b.low + b.close) / 3;
    const vol = Math.max(0, b.volume);

    cumulativePv += typicalPrice * vol;
    cumulativeVolume += vol;
  }

  if (cumulativeVolume <= 0) {
    const fallbackPrice = bars[bars.length - 1].close;
    return {
      anchorName,
      anchorDate: bars[anchorIndex].date,
      anchorIndex,
      vwap: fallbackPrice,
      upperBand1sd: fallbackPrice,
      lowerBand1sd: fallbackPrice,
      upperBand2sd: fallbackPrice,
      lowerBand2sd: fallbackPrice,
      stdDev: 0,
      sampleBars,
    };
  }

  const vwap = Number((cumulativePv / cumulativeVolume).toFixed(2));

  // 2. Pass 2: Volume-Weighted Standard Deviation
  let cumulativeVarianceWeight = 0;
  for (let i = anchorIndex; i < bars.length; i++) {
    const b = bars[i];
    const typicalPrice = (b.high + b.low + b.close) / 3;
    const vol = Math.max(0, b.volume);
    const deviation = typicalPrice - vwap;

    cumulativeVarianceWeight += vol * (deviation * deviation);
  }

  const variance = cumulativeVarianceWeight / cumulativeVolume;
  const stdDev = Number(Math.sqrt(variance).toFixed(2));

  return {
    anchorName,
    anchorDate: bars[anchorIndex].date,
    anchorIndex,
    vwap,
    upperBand1sd: Number((vwap + 1.0 * stdDev).toFixed(2)),
    lowerBand1sd: Number((vwap - 1.0 * stdDev).toFixed(2)),
    upperBand2sd: Number((vwap + 2.0 * stdDev).toFixed(2)),
    lowerBand2sd: Number((vwap - 2.0 * stdDev).toFixed(2)),
    stdDev,
    sampleBars,
  };
}

/**
 * Finds the index of the lowest trough (base low) in the given bar window.
 */
export function findBaseTroughIndex(bars: VwapPriceBar[], lookback = 60): number {
  if (!bars || bars.length === 0) return 0;
  const startIndex = Math.max(0, bars.length - lookback);

  let lowestPrice = Infinity;
  let lowestIndex = startIndex;

  for (let i = startIndex; i < bars.length; i++) {
    if (bars[i].low < lowestPrice) {
      lowestPrice = bars[i].low;
      lowestIndex = i;
    }
  }

  return lowestIndex;
}

/**
 * Finds the index of the highest volume (climax) bar in the given bar window.
 */
export function findVolumeClimaxIndex(bars: VwapPriceBar[], lookback = 60): number {
  if (!bars || bars.length === 0) return 0;
  const startIndex = Math.max(0, bars.length - lookback);

  let highestVolume = -1;
  let climaxIndex = startIndex;

  for (let i = startIndex; i < bars.length; i++) {
    if (bars[i].volume > highestVolume) {
      highestVolume = bars[i].volume;
      climaxIndex = i;
    }
  }

  return climaxIndex;
}

/**
 * Finds the index of the 52-week (or available range) highest price bar.
 */
export function find52WeekHighIndex(bars: VwapPriceBar[], lookback = 250): number {
  if (!bars || bars.length === 0) return 0;
  const startIndex = Math.max(0, bars.length - lookback);

  let highestPrice = -1;
  let highIndex = startIndex;

  for (let i = startIndex; i < bars.length; i++) {
    if (bars[i].high > highestPrice) {
      highestPrice = bars[i].high;
      highIndex = i;
    }
  }

  return highIndex;
}
