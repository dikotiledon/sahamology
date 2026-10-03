import {
  RetailParticipantMetrics,
  SyndicateConcentrationMetrics,
  RhiRegime,
} from './types';

export interface RhiConfluenceInput {
  currentPrice: number;
  rhiScore: number;
  retail: RetailParticipantMetrics;
  syndicate: SyndicateConcentrationMetrics;
  totalTurnover: number;
}

export interface RhiConfluenceResult {
  regime: RhiRegime;
  score: number;
  advisory: string;
}

/**
 * Evaluates the Retail Herd Index (RHI) and Syndicate Concentration confluence regime,
 * conviction score, and Indonesian tactical advisory.
 */
export function evaluateRhiConfluence(input: RhiConfluenceInput): RhiConfluenceResult {
  const { rhiScore, retail, syndicate, totalTurnover } = input;

  // 1. Retail Herd FOMO Trap (Retail crowding at highs with high retail participation)
  if (
    rhiScore >= 70 ||
    (retail.retailParticipationRatio >= 0.35 && retail.retailNetBuyValue > 0)
  ) {
    return {
      regime: 'RETAIL_HERD_FOMO_TRAP',
      score: 30,
      advisory: `Peringatan Retail Herd FOMO Trap (Skor RHI: ${rhiScore}/100): Broker retail mendominasi ${(retail.retailParticipationRatio * 100).toFixed(1)}% transaksi dengan net buy agresif (Top Retail Buyer: ${retail.topRetailBuyer || 'YP/PD/XC'}), sementara akumulasi institusi memudar. Risiko tinggi distribusi tersembunyi.`,
    };
  }

  // 2. Institutional Stealth Accumulation (Low retail presence + high syndicate asymmetry)
  if (
    rhiScore <= 32 ||
    (syndicate.syndicateAsymmetryRatio >= 2.5 && retail.retailNetBuyValue <= 0)
  ) {
    return {
      regime: 'INSTITUTIONAL_STEALTH_ACCUMULATION',
      score: 90,
      advisory: `Akumulasi Senyap Institusi (Stealth Accumulation, Skor RHI: ${rhiScore}/100): Broker retail tercatat net sell atau absen, sementara sindikat broker Top-3 mengakumulasi tebal (Asymmetry Ratio: ${syndicate.syndicateAsymmetryRatio}x, Top Buyer: ${syndicate.topSyndicateBuyer || 'AK/BK'}). Konfluensi Bandarmology sangat kuat.`,
    };
  }

  // 3. Retail Panic Capitulation (Retail heavy net selling while price holds)
  const retailSellRatio =
    totalTurnover > 0 ? (Math.abs(retail.retailNetBuyValue) / totalTurnover) * 100 : 0;
  if (retail.retailNetBuyValue < 0 && retailSellRatio >= 20.0) {
    return {
      regime: 'RETAIL_PANIC_CAPITULATION',
      score: 70,
      advisory: `Kapitulasi Panik Retail (Net Sell Retail: ${retailSellRatio.toFixed(1)}% omzet): Tekanan jual retail panik terserap oleh antrean bid institusi. Sinyal pembersihan tangan lemah (shakeout) sebelum dorongan markup berlanjut.`,
    };
  }

  // 4. Syndicate Dominant Flow (Top-3 buyers strongly concentrated)
  if (syndicate.top3ConcentrationRatio >= 0.45 && retail.retailParticipationRatio <= 0.25) {
    return {
      regime: 'SYNDICATE_DOMINANT_FLOW',
      score: 80,
      advisory: `Dominasi Aliran Sindikat: Konsentrasi beli Top-3 mencapai ${(syndicate.top3ConcentrationRatio * 100).toFixed(1)}% dengan partisipasi retail terkendali (${(retail.retailParticipationRatio * 100).toFixed(1)}%). Struktur likuiditas sehat di tangan pengendali pasar.`,
    };
  }

  // 5. Balanced Herd Flow
  return {
    regime: 'BALANCED_HERD_FLOW',
    score: 50,
    advisory: `Arus order flow seimbang antara partisipasi retail (${(retail.retailParticipationRatio * 100).toFixed(1)}%) dan sindikat institusional (Skor RHI: ${rhiScore}/100).`,
  };
}
