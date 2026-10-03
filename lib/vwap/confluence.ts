import type {
  VwapAnchorMetric,
  VwapConfluenceRegime,
} from './types';

export interface VwapConfluenceInput {
  currentPrice: number;
  baseAnchor: VwapAnchorMetric;
  volumeClimaxAnchor: VwapAnchorMetric | null;
  high52wAnchor: VwapAnchorMetric | null;
  bandarVwapTop3: number | null;
}

export interface VwapConfluenceResult {
  confluenceRegime: VwapConfluenceRegime;
  regimeScore: number;
  advisory: string;
  spreadToBasePct: number;
  spreadToBandarPct: number | null;
}

/**
 * Evaluates the structural interaction between the current market price and key
 * institutional Anchored VWAP and Bandar VWAP benchmarks.
 */
export function evaluateVwapConfluence(input: VwapConfluenceInput): VwapConfluenceResult {
  const {
    currentPrice,
    baseAnchor,
    volumeClimaxAnchor,
    high52wAnchor,
    bandarVwapTop3,
  } = input;

  const baseVwap = baseAnchor.vwap;
  const spreadToBasePct = Number((((currentPrice - baseVwap) / baseVwap) * 100).toFixed(2));

  let spreadToBandarPct: number | null = null;
  if (bandarVwapTop3 && bandarVwapTop3 > 0) {
    spreadToBandarPct = Number((((currentPrice - bandarVwapTop3) / bandarVwapTop3) * 100).toFixed(2));
  }

  // 1. Institutional Capitulation Breakdown (Price < -2% below base AVWAP or Bandar VWAP)
  if (spreadToBasePct < -2.0 || (spreadToBandarPct != null && spreadToBandarPct < -2.5)) {
    return {
      confluenceRegime: 'INSTITUTIONAL_CAPITULATION_BREAKDOWN',
      regimeScore: 25,
      advisory: '⚠️ KAPITULASI BREAKDOWN: Harga jebol di bawah AVWAP Basis & Bandar VWAP (> 2%). Institusi gagal mempertahankan harga modal rata-rata, hindari menangkap pisau jatuh.',
      spreadToBasePct,
      spreadToBandarPct,
    };
  }

  // 2. Overextended Value Exhaustion (Price > Upper Band +2SD of Base AVWAP)
  if (baseAnchor.upperBand2sd > 0 && currentPrice > baseAnchor.upperBand2sd) {
    return {
      confluenceRegime: 'OVEREXTENDED_VALUE_EXHAUSTION',
      regimeScore: 55,
      advisory: '⚡ NILAI OVEREXTENDED: Harga menembus pita +2 SD di atas AVWAP. Resiko penarikan kembali (mean reversion) menuju nilai wajar institusi sangat tinggi, jangan mengejar entri.',
      spreadToBasePct,
      spreadToBandarPct,
    };
  }

  // 3. Institutional Defense (Price within +/- 1.5% of Base AVWAP or Bandar VWAP)
  const isNearBase = Math.abs(spreadToBasePct) <= 1.5;
  const isNearBandar = spreadToBandarPct != null && Math.abs(spreadToBandarPct) <= 1.5;

  if (isNearBase || isNearBandar) {
    return {
      confluenceRegime: 'AT_INSTITUTIONAL_DEFENSE',
      regimeScore: 85,
      advisory: '🛡️ PERTAHANAN MODAL INSTITUSI: Harga menguji level AVWAP Basis / Bandar VWAP (toleransi ±1.5%). Titik pantulan ideal dengan rasio risk/reward optimal sebelum markup berlanjut.',
      spreadToBasePct,
      spreadToBandarPct,
    };
  }

  // 4. Above All Anchors Expansion (Price > Base, Climax, and 52w High AVWAP)
  const isAboveBase = currentPrice >= baseVwap;
  const isAboveClimax = !volumeClimaxAnchor || currentPrice >= volumeClimaxAnchor.vwap;
  const isAboveHigh52w = !high52wAnchor || currentPrice >= high52wAnchor.vwap;

  if (isAboveBase && isAboveClimax && isAboveHigh52w) {
    return {
      confluenceRegime: 'ABOVE_ALL_ANCHORS_EXPANSION',
      regimeScore: 90,
      advisory: '🌊 EKSPANSI SEMUA ANCHOR: Harga melaju di atas AVWAP Basis, Titik Klimaks Volume, dan Puncak 52-Minggu. Seluruh suplai historis telah menguntungkan, minim hambatan pasokan.',
      spreadToBasePct,
      spreadToBandarPct,
    };
  }

  // 5. Trapped Below Climax (Price below Volume Climax AVWAP)
  if (volumeClimaxAnchor && currentPrice < volumeClimaxAnchor.vwap) {
    return {
      confluenceRegime: 'TRAPPED_BELOW_CLIMAX',
      regimeScore: 40,
      advisory: '⚠️ TERJEBAK DI BAWAH KLIMAKS: Harga berada di bawah AVWAP bar volume klimaks terbesar. Pembeli di puncak menjadi pasokan resistensi (trapped supply) yang menghambat kenaikan.',
      spreadToBasePct,
      spreadToBandarPct,
    };
  }

  // Default: Above base anchor
  return {
    confluenceRegime: 'AT_INSTITUTIONAL_DEFENSE',
    regimeScore: 70,
    advisory: 'Harga bertahan di atas rata-rata modal akumulasi AVWAP basis.',
    spreadToBasePct,
    spreadToBandarPct,
  };
}
