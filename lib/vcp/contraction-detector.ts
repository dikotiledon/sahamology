import { getIdxTickSize } from '@/lib/risk/sizer';
import type { ContractionWave, PriceBar, VcpStage } from './types';

export interface ContractionDetectionResult {
  contractions: ContractionWave[];
  contractionCount: number;
  pivotPrice: number | null;
  stopLossPrice: number | null;
  riskPct: number | null;
  volumeDryUpRatio: number | null;
  isVolumeDriedUp: boolean;
  stage: VcpStage;
  summary: string;
}

/**
 * Calculates simple moving average of volume over period.
 */
function calculateVolumeSma(bars: PriceBar[], period: number): number {
  if (bars.length === 0) return 0;
  const slice = bars.slice(-period);
  const sum = slice.reduce((acc, b) => acc + (b.volume || 0), 0);
  return sum / slice.length;
}

/**
 * Detects local swing highs and swing lows in price bars over window radius.
 */
function findPivots(bars: PriceBar[], radius = 2): { highs: { index: number; price: number }[]; lows: { index: number; price: number }[] } {
  const highs: { index: number; price: number }[] = [];
  const lows: { index: number; price: number }[] = [];

  for (let i = radius; i < bars.length - radius; i++) {
    const currentHigh = bars[i].high;
    const currentLow = bars[i].low;

    let isHigh = true;
    let isLow = true;

    for (let j = i - radius; j <= i + radius; j++) {
      if (j === i) continue;
      if (bars[j].high > currentHigh) isHigh = false;
      if (bars[j].low < currentLow) isLow = false;
    }

    if (isHigh) highs.push({ index: i, price: currentHigh });
    if (isLow) lows.push({ index: i, price: currentLow });
  }

  return { highs, lows };
}

/**
 * Detects Volatility Contraction Pattern (VCP) waves in a price series.
 */
export function detectContractions(bars: PriceBar[], lookbackBars = 60): ContractionDetectionResult {
  if (!bars || bars.length < 20) {
    const currentPrice = bars && bars.length > 0 ? bars[bars.length - 1].close : 0;
    return {
      contractions: [],
      contractionCount: 0,
      pivotPrice: currentPrice > 0 ? currentPrice : null,
      stopLossPrice: currentPrice > 0 ? currentPrice - getIdxTickSize(currentPrice) : null,
      riskPct: null,
      volumeDryUpRatio: null,
      isVolumeDriedUp: false,
      stage: 'DEVELOPING',
      summary: 'Data batang harga tidak mencukupi untuk mendeteksi struktur VCP (< 20 bar).',
    };
  }

  const analysisBars = bars.slice(-Math.min(bars.length, lookbackBars));
  const closes = analysisBars.map((b) => b.close);
  const currentPrice = closes[closes.length - 1];
  const sma50Vol = calculateVolumeSma(bars, 50);

  const { highs, lows } = findPivots(analysisBars, 2);

  // Group alternating highs and lows into contraction waves
  const rawWaves: ContractionWave[] = [];

  for (let i = 0; i < highs.length; i++) {
    const high = highs[i];
    // Find the lowest point between this high and the next high (or end of series)
    const nextHighIndex = i + 1 < highs.length ? highs[i + 1].index : analysisBars.length - 1;
    const interveningLows = lows.filter((l) => l.index >= high.index && l.index <= nextHighIndex);

    let lowPrice: number;
    let waveEndIndex: number;

    if (interveningLows.length > 0) {
      const minLow = interveningLows.reduce((min, cur) => (cur.price < min.price ? cur : min), interveningLows[0]);
      lowPrice = minLow.price;
      waveEndIndex = nextHighIndex;
    } else {
      // Slice bars between high and next high
      const subBars = analysisBars.slice(high.index, nextHighIndex + 1);
      lowPrice = Math.min(...subBars.map((b) => b.low));
      waveEndIndex = nextHighIndex;
    }

    if (high.price > lowPrice && high.price > 0) {
      const depthPct = Number((((high.price - lowPrice) / high.price) * 100).toFixed(2));
      const lengthBars = Math.max(1, waveEndIndex - high.index + 1);
      const waveBars = analysisBars.slice(high.index, waveEndIndex + 1);
      const avgVol = waveBars.reduce((sum, b) => sum + b.volume, 0) / waveBars.length;

      rawWaves.push({
        waveIndex: rawWaves.length + 1,
        depthPct,
        lengthBars,
        highPrice: high.price,
        lowPrice,
        avgVolume: Math.round(avgVol),
      });
    }
  }

  // Filter or trim to find valid contracting sequence (where D_k > D_k+1)
  let validSequence: ContractionWave[] = [];

  if (rawWaves.length >= 2) {
    // Scan from right to left for a valid sequence of 2 to 4 contractions
    for (let end = rawWaves.length; end >= 2; end--) {
      for (let start = Math.max(0, end - 4); start <= end - 2; start++) {
        const candidate = rawWaves.slice(start, end);
        let isContracting = true;
        for (let k = 0; k < candidate.length - 1; k++) {
          if (candidate[k].depthPct <= candidate[k + 1].depthPct) {
            isContracting = false;
            break;
          }
        }
        if (isContracting && candidate.length > validSequence.length) {
          validSequence = candidate.map((w, idx) => ({ ...w, waveIndex: idx + 1 }));
        }
      }
    }
  }

  // Fallback heuristic: If swing pivot detection yielded fewer than 2 clean waves,
  // evaluate rolling 2-wave volatility slices
  if (validSequence.length < 2 && analysisBars.length >= 30) {
    const halfLen = Math.floor(analysisBars.length / 2);
    const wave1Bars = analysisBars.slice(0, halfLen);
    const wave2Bars = analysisBars.slice(halfLen);

    const h1 = Math.max(...wave1Bars.map((b) => b.high));
    const l1 = Math.min(...wave1Bars.map((b) => b.low));
    const h2 = Math.max(...wave2Bars.map((b) => b.high));
    const l2 = Math.min(...wave2Bars.map((b) => b.low));

    const d1 = h1 > 0 ? Number((((h1 - l1) / h1) * 100).toFixed(2)) : 0;
    const d2 = h2 > 0 ? Number((((h2 - l2) / h2) * 100).toFixed(2)) : 0;

    if (d1 > d2 && d2 > 0 && d2 <= 20) {
      const vol1 = wave1Bars.reduce((s, b) => s + b.volume, 0) / wave1Bars.length;
      const vol2 = wave2Bars.reduce((s, b) => s + b.volume, 0) / wave2Bars.length;

      validSequence = [
        { waveIndex: 1, depthPct: d1, lengthBars: wave1Bars.length, highPrice: h1, lowPrice: l1, avgVolume: Math.round(vol1) },
        { waveIndex: 2, depthPct: d2, lengthBars: wave2Bars.length, highPrice: h2, lowPrice: l2, avgVolume: Math.round(vol2) },
      ];
    }
  }

  const contractionCount = validSequence.length;
  let pivotPrice: number | null;
  let stopLossPrice: number | null;
  let riskPct: number | null = null;
  let volumeDryUpRatio: number | null = null;
  let isVolumeDriedUp = false;
  let stage: VcpStage;
  let summary: string;

  if (contractionCount >= 2) {
    const finalWave = validSequence[validSequence.length - 1];
    pivotPrice = finalWave.highPrice;

    // Invalidation stop is 1 tick below final contraction trough
    const tick = getIdxTickSize(finalWave.lowPrice);
    stopLossPrice = Math.max(1, finalWave.lowPrice - tick);

    if (pivotPrice > stopLossPrice) {
      riskPct = Number((((pivotPrice - stopLossPrice) / pivotPrice) * 100).toFixed(2));
    }

    // Volume dry-up ratio: final wave average volume vs 50-day volume SMA
    if (sma50Vol > 0) {
      volumeDryUpRatio = Number((finalWave.avgVolume / sma50Vol).toFixed(2));
      isVolumeDriedUp = volumeDryUpRatio <= 0.65;
    }

    const latestBar = analysisBars[analysisBars.length - 1];

    if (currentPrice < stopLossPrice) {
      stage = 'FAILED';
      summary = `VCP Gagal: Harga (${currentPrice}) menembus stop loss (${stopLossPrice}) di bawah wave terakhir.`;
    } else if (currentPrice > pivotPrice) {
      const isBreakoutVolume = sma50Vol > 0 && latestBar.volume >= 1.2 * sma50Vol;
      stage = isBreakoutVolume ? 'BREAKOUT_CONFIRMED' : 'DEVELOPING';
      summary = isBreakoutVolume
        ? `VCP Terkonfirmasi Breakout: Harga (${currentPrice}) menembus pivot (${pivotPrice}) dengan volume kuat.`
        : `Harga di atas pivot (${pivotPrice}) namun belum ada konfirmasi volume lonjakan.`;
    } else {
      // Inside the base
      if (isVolumeDriedUp && currentPrice >= stopLossPrice && riskPct !== null && riskPct <= 8.0) {
        stage = 'PIVOT_READY';
        summary = `VCP Siap Breakout (${contractionCount}T): Kontraksi menyempit ke ${finalWave.depthPct}%, volume mengering (${volumeDryUpRatio}x MA50). Pivot Rp ${pivotPrice}.`;
      } else {
        stage = 'DEVELOPING';
        summary = `VCP Sedang Berkembang (${contractionCount}T): Kedalaman kontraksi ${validSequence.map((w) => `${w.depthPct}%`).join(' → ')}.`;
      }
    }
  } else {
    pivotPrice = Math.max(...analysisBars.map((b) => b.high));
    const minLow = Math.min(...analysisBars.map((b) => b.low));
    stopLossPrice = Math.max(1, minLow - getIdxTickSize(minLow));
    if (pivotPrice > stopLossPrice) {
      riskPct = Number((((pivotPrice - stopLossPrice) / pivotPrice) * 100).toFixed(2));
    }
    stage = 'DEVELOPING';
    summary = 'Struktur kontraksi belum memenuhi kriteria VCP (membutuhkan minimal 2 kontraksi berurutan).';
  }

  return {
    contractions: validSequence,
    contractionCount,
    pivotPrice,
    stopLossPrice,
    riskPct,
    volumeDryUpRatio,
    isVolumeDriedUp,
    stage,
    summary,
  };
}
