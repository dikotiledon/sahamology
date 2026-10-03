import {
  CvdMetrics,
  TapeAggression,
  CvdDivergenceType,
  CvdRegime,
} from './types';

export interface CvdConfluenceInput {
  currentPrice: number;
  cvd: CvdMetrics;
  aggression: TapeAggression;
  divergence: CvdDivergenceType;
}

export interface CvdConfluenceResult {
  regime: CvdRegime;
  score: number;
  advisory: string;
}

/**
 * Evaluates the Cumulative Volume Delta (CVD) confluence regime, conviction score,
 * and Indonesian tactical advisory based on order flow metrics, foreign tape aggression,
 * and absorption/exhaustion divergences.
 */
export function evaluateCvdConfluence(input: CvdConfluenceInput): CvdConfluenceResult {
  const { cvd, aggression, divergence } = input;

  // 1. Bullish CVD Absorption Divergence (highest priority confluence)
  if (divergence === 'BULLISH_CVD_ABSORPTION') {
    return {
      regime: 'BULLISH_CVD_ABSORPTION',
      score: 90,
      advisory: `Divergensi Bullish Absorption: Pembeli pasif institusi menyerap seluruh tekanan jual pasar pada saat harga menguji support. Sinyal kuat akumulasi tersembunyi Smart Money dengan Cumulative Delta berbalik naik (+${cvd.deltaRatioPct}%).`,
    };
  }

  // 2. Bearish CVD Exhaustion Divergence
  if (divergence === 'BEARISH_CVD_EXHAUSTION') {
    return {
      regime: 'BEARISH_CVD_EXHAUSTION',
      score: 30,
      advisory: `Peringatan Bearish Exhaustion: Kenaikan harga terkini tidak didukung oleh volume delta baru (${cvd.deltaRatioPct}% rasio delta). Antusiasme beli agresif memudar dan menghadapi dinding penawaran pasif institusi.`,
    };
  }

  // 3. Aggressive Market Markup (harmonic bullish order flow)
  if (
    cvd.trend === 'ACCUMULATING' &&
    (aggression.status === 'DOMINANT_BUY_AGGRESSION' || aggression.aggressionRatio >= 0.6)
  ) {
    return {
      regime: 'AGGRESSIVE_MARKET_MARKUP',
      score: 85,
      advisory: `Ekspansi Markup Agresif: Cumulative Volume Delta positif (+${cvd.deltaRatioPct}%) selaras dengan dominasi HAKA asing (${(
        aggression.aggressionRatio * 100
      ).toFixed(1)}% rasio beli agresif). Momentum pembeli aktif mendorong kelanjutan tren naik.`,
    };
  }

  // 4. Aggressive Market Markdown (harmonic bearish liquidation)
  if (
    cvd.trend === 'DISTRIBUTING' &&
    (aggression.status === 'DOMINANT_SELL_AGGRESSION' || aggression.aggressionRatio <= 0.4)
  ) {
    return {
      regime: 'AGGRESSIVE_MARKET_MARKDOWN',
      score: 20,
      advisory: `Distribusi Penjualan Agresif: Tekanan HAKI mendominasi (${(
        (1 - aggression.aggressionRatio) * 100
      ).toFixed(1)}% rasio jual) dengan Cumulative Volume Delta negatif (${cvd.deltaRatioPct}%). Pertahanan modal mutlak terhadap kelanjutan markdown.`,
    };
  }

  // 5. Neutral Delta Rotation
  return {
    regime: 'NEUTRAL_DELTA_ROTATION',
    score: 50,
    advisory: `Order flow dalam rotasi netral: Rasio volume delta seimbang (${cvd.deltaRatioPct}%) tanpa divergensi absorpsi signifikan.`,
  };
}
