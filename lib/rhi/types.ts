/**
 * Domain types for Phase 22: Retail Herd Dispersion, Broker Concentration &
 * Syndicate Asymmetry Engine (Retail Herd Index / RHI for IDX).
 */

export interface BrokerSummaryRecord {
  brokerCode: string;
  buyValue: number;
  sellValue: number;
  netValue: number;
  buyVolume: number;
  sellVolume: number;
  netVolume: number;
}

export interface RetailParticipantMetrics {
  retailGrossValue: number;
  retailNetBuyValue: number;
  retailParticipationRatio: number; // Retail Turnover / Total Turnover (0.0 to 1.0)
  topRetailBuyer: string | null;
  topRetailSeller: string | null;
}

export interface SyndicateConcentrationMetrics {
  top1NetBuyValue: number;
  top3NetBuyValue: number;
  top5NetBuyValue: number;
  top3ConcentrationRatio: number; // Top 3 Net Buy / Total Buy Turnover (0.0 to 1.0)
  topSyndicateBuyer: string | null;
  topSyndicateSeller: string | null;
  syndicateAsymmetryRatio: number; // Top 3 Net Buy / max(10M, |Retail Net Buy|)
}

export type RhiRegime =
  | 'INSTITUTIONAL_STEALTH_ACCUMULATION'
  | 'SYNDICATE_DOMINANT_FLOW'
  | 'BALANCED_HERD_FLOW'
  | 'RETAIL_HERD_FOMO_TRAP'
  | 'RETAIL_PANIC_CAPITULATION';

export interface RhiAssessment {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  rhiScore: number; // 0 to 100
  retail: RetailParticipantMetrics;
  syndicate: SyndicateConcentrationMetrics;
  confluenceRegime: RhiRegime;
  convictionScore: number;
  advisory: string;
}
