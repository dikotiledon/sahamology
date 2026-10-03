import { BarDelta, CvdDivergenceType } from './types';

export interface DivergenceResult {
  type: CvdDivergenceType;
  priceDeltaSpreadPct: number;
  description: string;
}

/**
 * Detects Order Flow Divergence between Price action and Cumulative Volume Delta (CVD)
 * over a lookback window (default 15 to 20 sessions).
 */
export function detectCvdDivergence(barDeltas: BarDelta[], lookback = 20): DivergenceResult {
  const count = barDeltas.length;

  if (count < 10) {
    return {
      type: 'NONE',
      priceDeltaSpreadPct: 0,
      description: 'Data historis tidak mencukupi untuk mendeteksi divergensi order flow.',
    };
  }

  const windowSlice = barDeltas.slice(Math.max(0, count - lookback));
  const n = windowSlice.length;

  // Build cumulative volume delta series across the slice
  const cvdSeries: number[] = [];
  let runningCvd = 0;
  for (const b of windowSlice) {
    runningCvd += b.deltaVolume;
    cvdSeries.push(runningCvd);
  }

  // 1. Check for Bullish CVD Absorption (Price makes lower/equal low, CVD makes higher low)
  // Split window into first half (past pivot) and second half (recent pivot)
  const midIndex = Math.floor(n / 2);
  const firstHalf = windowSlice.slice(0, midIndex);
  const secondHalf = windowSlice.slice(midIndex);

  let pastLowestPriceIdx = 0;
  for (let i = 1; i < firstHalf.length; i++) {
    if (firstHalf[i].close < firstHalf[pastLowestPriceIdx].close) {
      pastLowestPriceIdx = i;
    }
  }

  let recentLowestPriceIdx = 0;
  for (let i = 1; i < secondHalf.length; i++) {
    if (secondHalf[i].close < secondHalf[recentLowestPriceIdx].close) {
      recentLowestPriceIdx = i;
    }
  }
  const globalRecentLowestIdx = midIndex + recentLowestPriceIdx;

  const pastPriceLow = firstHalf[pastLowestPriceIdx].close;
  const recentPriceLow = secondHalf[recentLowestPriceIdx].close;
  const pastCvdLow = cvdSeries[pastLowestPriceIdx];
  const recentCvdLow = cvdSeries[globalRecentLowestIdx];

  // If price made a lower low (or flat low <= past + 1%) but CVD made a higher low
  if (recentPriceLow <= pastPriceLow * 1.01 && recentCvdLow > pastCvdLow + 0.15 * Math.abs(pastCvdLow || 1)) {
    const spreadPct = Number((((recentCvdLow - pastCvdLow) / Math.abs(pastCvdLow || 1)) * 100).toFixed(2));
    return {
      type: 'BULLISH_CVD_ABSORPTION',
      priceDeltaSpreadPct: spreadPct,
      description: 'Divergensi Bullish Absorption terdeteksi: Harga membentuk lembah yang lebih rendah/setara sementara Cumulative Volume Delta (CVD) membentuk lembah yang lebih tinggi. Pembeli pasif institusi menyerap seluruh tekanan jual agresif pasar.',
    };
  }

  // 2. Check for Bearish CVD Exhaustion (Price makes higher/equal high, CVD makes lower high)
  let pastHighestPriceIdx = 0;
  for (let i = 1; i < firstHalf.length; i++) {
    if (firstHalf[i].close > firstHalf[pastHighestPriceIdx].close) {
      pastHighestPriceIdx = i;
    }
  }

  let recentHighestPriceIdx = 0;
  for (let i = 1; i < secondHalf.length; i++) {
    if (secondHalf[i].close > secondHalf[recentHighestPriceIdx].close) {
      recentHighestPriceIdx = i;
    }
  }
  const globalRecentHighestIdx = midIndex + recentHighestPriceIdx;

  const pastPriceHigh = firstHalf[pastHighestPriceIdx].close;
  const recentPriceHigh = secondHalf[recentHighestPriceIdx].close;
  const pastCvdHigh = cvdSeries[pastHighestPriceIdx];
  const recentCvdHigh = cvdSeries[globalRecentHighestIdx];

  if (recentPriceHigh >= pastPriceHigh * 0.99 && recentCvdHigh < pastCvdHigh - 0.15 * Math.abs(pastCvdHigh || 1)) {
    const spreadPct = Number((((recentCvdHigh - pastCvdHigh) / Math.abs(pastCvdHigh || 1)) * 100).toFixed(2));
    return {
      type: 'BEARISH_CVD_EXHAUSTION',
      priceDeltaSpreadPct: spreadPct,
      description: 'Divergensi Bearish Exhaustion terdeteksi: Harga membentuk puncak yang lebih tinggi/setara sementara Cumulative Volume Delta (CVD) melemah. Antusiasme beli agresif memudar dan menghadapi distribusi pasif institusi.',
    };
  }

  return {
    type: 'NONE',
    priceDeltaSpreadPct: 0,
    description: 'Tidak terdeteksi divergensi order flow signifikan antara harga dan volume delta.',
  };
}
