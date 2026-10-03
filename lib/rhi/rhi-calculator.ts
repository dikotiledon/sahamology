import {
  BrokerSummaryRecord,
  RetailParticipantMetrics,
  SyndicateConcentrationMetrics,
} from './types';
import { extractRetailMetrics } from './broker-classifier';

export interface RhiCalculationResult {
  rhiScore: number;
  retail: RetailParticipantMetrics;
  syndicate: SyndicateConcentrationMetrics;
  totalTurnover: number;
}

/**
 * Calculates the Retail Herd Index (RHI: 0-100), Syndicate Asymmetry Ratio (SAR),
 * and broker concentration metrics from EOD broker summary records.
 */
export function calculateRetailHerdMetrics(
  records: BrokerSummaryRecord[]
): RhiCalculationResult {
  if (records.length === 0) {
    return {
      rhiScore: 50,
      retail: {
        retailGrossValue: 0,
        retailNetBuyValue: 0,
        retailParticipationRatio: 0,
        topRetailBuyer: null,
        topRetailSeller: null,
      },
      syndicate: {
        top1NetBuyValue: 0,
        top3NetBuyValue: 0,
        top5NetBuyValue: 0,
        top3ConcentrationRatio: 0,
        topSyndicateBuyer: null,
        topSyndicateSeller: null,
        syndicateAsymmetryRatio: 1.0,
      },
      totalTurnover: 0,
    };
  }

  // Calculate total gross turnover
  let totalTurnover = 0;
  for (const r of records) {
    totalTurnover += (r.buyValue || 0) + (r.sellValue || 0);
  }

  // 1. Extract Retail Participant Metrics
  const retail = extractRetailMetrics(records, totalTurnover);

  // 2. Sort brokers descending by net buy value
  const sortedBuyers = [...records].sort((a, b) => (b.netValue || 0) - (a.netValue || 0));
  const sortedSellers = [...records].sort((a, b) => (a.netValue || 0) - (b.netValue || 0));

  const top1NetBuyValue = Math.max(0, sortedBuyers[0]?.netValue || 0);
  const top3NetBuyValue = sortedBuyers
    .slice(0, 3)
    .reduce((sum, b) => sum + Math.max(0, b.netValue || 0), 0);
  const top5NetBuyValue = sortedBuyers
    .slice(0, 5)
    .reduce((sum, b) => sum + Math.max(0, b.netValue || 0), 0);

  const topSyndicateBuyer = sortedBuyers[0]?.netValue > 0 ? sortedBuyers[0].brokerCode.toUpperCase() : null;
  const topSyndicateSeller = sortedSellers[0]?.netValue < 0 ? sortedSellers[0].brokerCode.toUpperCase() : null;

  // Total buy turnover
  const totalBuyTurnover = records.reduce((sum, b) => sum + (b.buyValue || 0), 0);
  const top3ConcentrationRatio =
    totalBuyTurnover > 0 ? Number((top3NetBuyValue / totalBuyTurnover).toFixed(4)) : 0;

  // Syndicate Asymmetry Ratio (SAR)
  // Ratio of Top-3 net buy against retail net flow (with a 10M floor to prevent div by zero)
  const retailAbsDenom = Math.max(10_000_000, Math.abs(retail.retailNetBuyValue));
  const syndicateAsymmetryRatio = Number((top3NetBuyValue / retailAbsDenom).toFixed(2));

  // 3. Compute Retail Herd Index (RHI: 0-100)
  // Neutral baseline is 50. High retail net buying inflates RHI towards 100.
  // High top-3 institutional net buying deflates RHI towards 0 (stealth accumulation).
  const retailRatio = totalTurnover > 0 ? (retail.retailNetBuyValue / totalTurnover) * 100 : 0;
  const top3Ratio = totalTurnover > 0 ? (top3NetBuyValue / totalTurnover) * 100 : 0;

  const rawScore = 50 + 2.5 * retailRatio - 1.2 * top3Ratio;
  const rhiScore = Number(Math.max(0, Math.min(100, rawScore)).toFixed(1));

  return {
    rhiScore,
    retail,
    syndicate: {
      top1NetBuyValue,
      top3NetBuyValue,
      top5NetBuyValue,
      top3ConcentrationRatio,
      topSyndicateBuyer,
      topSyndicateSeller,
      syndicateAsymmetryRatio,
    },
    totalTurnover,
  };
}
