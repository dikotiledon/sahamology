import { calculateConcentration } from './concentration';
import { calculateSegmentation, classifyBroker } from './segmentation';
import { calculateNgCrossing } from './crossing';
import { calculateVolumeAnomaly, type PriceBar } from './volume-anomaly';
import type {
  BrokerSummaryEntry,
  RadarAssessment,
  RadarVerdict,
} from './types';

export interface EvaluateRadarInput {
  emiten: string;
  asOf: string;
  rgSummary: BrokerSummaryEntry[];
  ngSummary?: BrokerSummaryEntry[];
  priceBars?: PriceBar[];
  avgDailyRgValue?: number;
  historicalFlow?: Array<{ date: string; brokerCode: string; netValue: number }>;
}

/**
 * Evaluates the full IDX Brosum Insider Trade Radar for an emiten.
 * Synthesizes the 5 core sub-methods into a normalized 0..100 score,
 * categorical verdict, and structured evidence statements.
 */
export function evaluateRadar(input: EvaluateRadarInput): RadarAssessment {
  const {
    emiten,
    asOf,
    rgSummary = [],
    ngSummary = [],
    priceBars = [],
    avgDailyRgValue = 0,
    historicalFlow = [],
  } = input;

  // 1. Calculate Core Sub-Methods
  const concentration = calculateConcentration(rgSummary);
  const segmentation = calculateSegmentation(rgSummary);
  const ngCrossing = calculateNgCrossing({
    ngEntries: ngSummary,
    rgEntries: rgSummary,
    avgDailyRgValue,
  });
  const volumeAnomaly = calculateVolumeAnomaly(priceBars);

  // 2. Rolling Horizon Persistence (10d, 20d, 60d)
  const rolling10dScore = computeRollingFlowScore(historicalFlow, asOf, 10);
  const rolling20dScore = computeRollingFlowScore(historicalFlow, asOf, 20);
  const rolling60dScore = computeRollingFlowScore(historicalFlow, asOf, 60);

  // 3. Composite Radar Scoring (0 to 100, neutral = 50)
  let score = 50;
  const evidence: string[] = [];

  // Concentration contribution (-25 to +25)
  if (concentration.isExtremeConcentration) {
    const boost = Math.min(25, 15 + (concentration.top3NetValueRatio - 0.6) * 25);
    score += boost;
    evidence.push(
      `Extreme concentration: Top 3 buyers absorbed ${(concentration.top3NetValueRatio * 100).toFixed(1)}% of net turnover facing ${concentration.sellerCount} sellers`
    );
  } else if (concentration.top3NetValueRatio >= 0.5) {
    score += 8;
  }

  // Segmentation contribution (-25 to +25)
  if (segmentation.isInstitutionalAbsorption) {
    const boost = Math.min(25, 12 + Math.min(segmentation.institutionToRetailAbsorptionRatio - 1, 1) * 13);
    score += boost;
    evidence.push(
      `Institutional absorption: Institutions & foreign desks absorbed retail liquidation with ${(segmentation.institutionToRetailAbsorptionRatio).toFixed(2)}x ratio`
    );
  } else if (segmentation.retailNetValue > 0 && segmentation.foreignNetValue < 0) {
    // Retail buying while institutions liquidate -> distribution penalty
    score -= 15;
    evidence.push(
      `Retail distribution trap: Retail net buying ${(segmentation.retailNetValue / 1e6).toFixed(0)}M while foreign desks are net sellers`
    );
  }

  // Volume Anomaly / Volatility Decoupling contribution (0 to +20)
  if (volumeAnomaly.isSilentAccumulation) {
    score += 18;
    evidence.push(
      `Silent accumulation: Volume surge ${volumeAnomaly.volumeRatioToSma50.toFixed(1)}x MA50 with compressed volatility (${volumeAnomaly.priceVolatilityRatio.toFixed(2)}x ATR)`
    );
  } else if (volumeAnomaly.volumeRatioToSma50 >= 2.0 && volumeAnomaly.priceVolatilityRatio <= 1.0) {
    score += 8;
  }

  // Negotiated Market Crossing contribution (0 to +15)
  if (ngCrossing.hasSignificantCrossing) {
    if (ngCrossing.rgFollowThroughScore >= 0.3) {
      score += 15;
      evidence.push(
        `Pasar Nego crossing: ${(ngCrossing.ngValue / 1e9).toFixed(1)}B IDR block crossing with ${(ngCrossing.rgFollowThroughScore * 100).toFixed(0)}% follow-through accumulation on regular board`
      );
    } else {
      score += 5;
      evidence.push(
        `Pasar Nego block crossing: ${(ngCrossing.ngValue / 1e9).toFixed(1)}B IDR crossing detected across brokers (${ngCrossing.crossingBrokers.join(', ')})`
      );
    }
  }

  // Multi-window persistence contribution (-15 to +15)
  if (rolling10dScore >= 70 && rolling20dScore >= 60) {
    score += 12;
    evidence.push(
      `Multi-day accumulation persistence: 10d score (${rolling10dScore.toFixed(0)}) and 20d score (${rolling20dScore.toFixed(0)}) confirm sustained institutional accumulation`
    );
  } else if (rolling10dScore <= 30 && rolling20dScore <= 35) {
    score -= 12;
    evidence.push(
      `Multi-day distribution trend: 10d score (${rolling10dScore.toFixed(0)}) and 20d score (${rolling20dScore.toFixed(0)}) indicate persistent net liquidation`
    );
  }

  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Determine Verdict
  let verdict: RadarVerdict = 'NEUTRAL';
  if (score >= 80) verdict = 'STRONG_ACCUMULATION';
  else if (score >= 65) verdict = 'MODERATE_ACCUMULATION';
  else if (score <= 20) verdict = 'HEAVY_DISTRIBUTION';
  else if (score <= 35) verdict = 'MODERATE_DISTRIBUTION';

  // Extract Top Buyers & Sellers
  const topBuyers = rgSummary
    .filter((e) => e.netValue > 0)
    .sort((a, b) => b.netValue - a.netValue)
    .slice(0, 5)
    .map((e) => ({
      code: e.brokerCode,
      netValue: e.netValue,
      avgPrice: e.avgBuyPrice,
      tier: classifyBroker(e.brokerCode),
    }));

  const topSellers = rgSummary
    .filter((e) => e.netValue < 0)
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue))
    .slice(0, 5)
    .map((e) => ({
      code: e.brokerCode,
      netValue: e.netValue,
      avgPrice: e.avgSellPrice,
      tier: classifyBroker(e.brokerCode),
    }));

  return {
    emiten,
    asOf,
    score,
    verdict,
    concentration,
    segmentation,
    ngCrossing,
    volumeAnomaly,
    rolling10dScore,
    rolling20dScore,
    rolling60dScore,
    topBuyers,
    topSellers,
    evidence,
  };
}

/**
 * Computes a 0..100 persistence score for historical daily broker flows over N sessions.
 * 50 = neutral, > 70 = sustained buying consistency, < 30 = sustained selling.
 */
function computeRollingFlowScore(
  flows: Array<{ date: string; brokerCode: string; netValue: number }>,
  asOf: string,
  sessions: number
): number {
  if (!flows || flows.length === 0) return 50;

  // Filter flows on or before asOf
  const validFlows = flows.filter((f) => f.date <= asOf);
  if (validFlows.length === 0) return 50;

  // Get unique dates descending
  const dates = Array.from(new Set(validFlows.map((f) => f.date)))
    .sort()
    .reverse()
    .slice(0, sessions);

  if (dates.length === 0) return 50;

  const activeDates = new Set(dates);
  const windowFlows = validFlows.filter((f) => activeDates.has(f.date));

  let totalNet = 0;
  let positiveDays = 0;
  for (const date of dates) {
    const dayFlows = windowFlows.filter((f) => f.date === date);
    const dayNet = dayFlows.reduce((sum, f) => sum + f.netValue, 0);
    totalNet += dayNet;
    if (dayNet > 0) positiveDays += 1;
  }

  const buyDayRatio = positiveDays / dates.length; // 0..1
  let score = 50 + (buyDayRatio - 0.5) * 60; // maps 0.5 -> 50, 1.0 -> 80, 0.0 -> 20

  if (totalNet > 0 && buyDayRatio >= 0.7) score += 10;
  else if (totalNet < 0 && buyDayRatio <= 0.3) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}
