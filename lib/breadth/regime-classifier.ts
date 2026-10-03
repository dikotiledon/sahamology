import type { MarketRegime } from './types';

export interface RegimeClassificationInput {
  pctAboveEma20: number;
  pctAboveSma50: number;
  pctAboveSma200: number;
  adRatio: number;
  netNewHighs: number;
  netForeignFlow: number;
}

export interface RegimeClassificationResult {
  regime: MarketRegime;
  score: number;
  advisory: string;
}

/**
 * Classifies overall IDX market environment into 5 deterministic regimes
 * based on participation breadth, AD ratio, and net 52w high/low spreads.
 */
export function classifyMarketRegime(input: RegimeClassificationInput): RegimeClassificationResult {
  const {
    pctAboveEma20,
    pctAboveSma50,
    pctAboveSma200,
    adRatio,
    netNewHighs,
    netForeignFlow,
  } = input;

  // 1. Oversold Capitulation (< 15% stocks above SMA50 and EMA20)
  if (pctAboveSma50 <= 15.0 && pctAboveEma20 <= 15.0) {
    const score = Math.max(10, Math.round((pctAboveSma50 + pctAboveEma20) / 2));
    return {
      regime: 'OVERSOLD_CAPITULATION',
      score,
      advisory: '⚠️ KAPITULASI PASAR EKSTREM: Breadth berada di area oversold ekstrem (< 15%). Waspadai technical rebound atau selling climax reversal institusi.',
    };
  }

  // 2. Bullish Expansion (>= 60% above SMA50, healthy AD ratio, positive new highs)
  if (pctAboveSma50 >= 60.0 && adRatio >= 1.25 && netNewHighs >= 0) {
    const score = Math.min(100, Math.round(50 + pctAboveSma50 * 0.4 + (adRatio - 1) * 10 + (netForeignFlow > 0 ? 5 : 0)));
    return {
      regime: 'BULLISH_EXPANSION',
      score,
      advisory: '🌊 EKSPANSI BULLISH: Partisipasi pasar meluas di atas SMA 50. Breakout momentum & VCP memiliki probabilitas follow-through tertinggi.',
    };
  }

  // 3. Healthy Pullback (SMA50 >= 50%, EMA20 < 40%, SMA200 >= 50%)
  if (pctAboveSma50 >= 50.0 && pctAboveEma20 < 40.0 && pctAboveSma200 >= 50.0) {
    const score = Math.round(50 + (pctAboveSma50 - 50) * 0.5);
    return {
      regime: 'HEALTHY_PULLBACK',
      score: Math.max(50, Math.min(74, score)),
      advisory: '🔄 PULLBACK SEHAT: Tren intermediate & jangka panjang tetap bullish, sementara momentum jangka pendek mengalami koreksi sehat. Cari setup pantulan support.',
    };
  }

  // 4. Bearish Distribution (SMA50 < 40%, AD ratio < 0.85, net new highs < -5)
  if (pctAboveSma50 < 40.0 && adRatio < 0.85 && netNewHighs < -5) {
    const score = Math.max(15, Math.round(pctAboveSma50 * 0.7));
    return {
      regime: 'BEARISH_DISTRIBUTION',
      score: Math.min(39, score),
      advisory: '⚠️ DISTRIBUSI BEARISH: Lebih dari 60% emiten berada di bawah SMA 50. Kurangi alokasi trading, prioritaskan proteksi modal.',
    };
  }

  // 5. Breadth Divergence Warning (SMA50 < 45% with negative new highs or weak AD ratio)
  if (pctAboveSma50 < 45.0 && (netNewHighs < 0 || adRatio < 1.0)) {
    return {
      regime: 'BREADTH_DIVERGENCE_WARNING',
      score: 42,
      advisory: '⚠️ PERINGATAN DIVERGENSI BREADTH: Partisipasi pasar menyempit. Hati-hati jebakan indeks (Index Divergence Trap), hindari mengejar breakout.',
    };
  }

  // 6. Neutral / Balanced Baseline
  const composite = Math.round((pctAboveEma20 + pctAboveSma50 + pctAboveSma200) / 3);
  if (composite >= 50) {
    return {
      regime: 'BULLISH_EXPANSION',
      score: Math.min(75, composite),
      advisory: 'Partisipasi pasar berada di atas rata-rata historis.',
    };
  }

  return {
    regime: 'BREADTH_DIVERGENCE_WARNING',
    score: Math.max(35, composite),
    advisory: 'Partisipasi pasar netral cenderung defensif.',
  };
}
