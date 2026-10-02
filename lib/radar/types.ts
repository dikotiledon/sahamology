/**
 * Types and interfaces for the IDX Brosum Insider Trade Radar.
 * Spec: .omh/plans/2026-10-02-trading-capability-brief.md
 */

export interface BrokerSummaryEntry {
  brokerCode: string;
  buyVolume: number;
  buyValue: number;
  sellVolume: number;
  sellValue: number;
  netVolume: number;
  netValue: number;
  avgBuyPrice: number;
  avgSellPrice: number;
}

export interface ConcentrationMetrics {
  top1NetValueRatio: number; // Ratio of top-1 net buy to total positive net buy value (0..1)
  top3NetValueRatio: number; // Ratio of top-3 net buy to total positive net buy value (0..1)
  retailDispersionIndex: number; // Herfindahl index of retail selling (lower = more dispersed across many brokers)
  sellerCount: number; // Number of distinct active sellers
  buyerPriceClusteringPct: number; // Spread of average buy price across top 3 accumulators relative to average
  isExtremeConcentration: boolean; // Top 3 absorbing >= 60% of net buying with >= 15 sellers
}

export type BrokerTier = 
  | 'FOREIGN_CUSTODIAN' 
  | 'BOUTIQUE_AFFILIATED' 
  | 'DOMESTIC_INSTITUTION' 
  | 'RETAIL' 
  | 'UNKNOWN';

export interface BrokerSegmentationMetrics {
  foreignNetValue: number;
  boutiqueNetValue: number;
  domesticInstNetValue: number;
  retailNetValue: number;
  institutionToRetailAbsorptionRatio: number; // Positive institutional flow divided by retail net selling
  predominantBuyerTier: BrokerTier;
  predominantSellerTier: BrokerTier;
  isInstitutionalAbsorption: boolean; // Institutional/Foreign net buyers absorbing retail net selling
}

export interface NgCrossingMetrics {
  ngVolume: number;
  ngValue: number;
  hasSignificantCrossing: boolean; // Crossing value > 5B IDR or > 20% average daily value
  crossingBrokers: string[];
  rgFollowThroughScore: number; // 0..1 indicating correlated accumulation on RG
}

export interface VolumeAnomalyMetrics {
  currentVolume: number;
  volumeSma50: number;
  volumeRatioToSma50: number; // e.g. 3.5x
  priceVolatilityRatio: number; // Current day / 50d average true range (compression when < 0.8)
  isSilentAccumulation: boolean; // Volume >= 3x MA50 with price volatility compressed (< 1.0)
}

export interface RelativeStrengthMetrics {
  emitenReturn20dPct: number; // 20-day percentage return of the emiten
  ihsgReturn20dPct: number; // 20-day percentage return of IHSG benchmark
  rsRatio: number; // (1 + emitenReturn20d) / (1 + ihsgReturn20d)
  outperforming: boolean; // true if rsRatio >= 1.0
  perfSpreadPct: number; // emitenReturn20dPct - ihsgReturn20dPct
}

export interface SectorFlowSummary {
  sector: string;
  emitenCount: number;
  totalNetInstitutionalValue: number;
  averageRadarScore: number;
  strongAccumCount: number;
  heavyDistCount: number;
}

export type RadarVerdict = 
  | 'STRONG_ACCUMULATION' 
  | 'MODERATE_ACCUMULATION' 
  | 'NEUTRAL' 
  | 'MODERATE_DISTRIBUTION' 
  | 'HEAVY_DISTRIBUTION';

export interface RadarAssessment {
  emiten: string;
  asOf: string;
  score: number; // 0 to 100
  verdict: RadarVerdict;
  concentration: ConcentrationMetrics;
  segmentation: BrokerSegmentationMetrics;
  ngCrossing: NgCrossingMetrics;
  volumeAnomaly: VolumeAnomalyMetrics;
  rolling10dScore: number;
  rolling20dScore: number;
  rolling60dScore: number;
  topBuyers: Array<{ code: string; netValue: number; avgPrice: number; tier: BrokerTier }>;
  topSellers: Array<{ code: string; netValue: number; avgPrice: number; tier: BrokerTier }>;
  evidence: string[];
  relativeStrength?: RelativeStrengthMetrics;
  sector?: string;
}
