import type { BrokerSummaryEntry, NgCrossingMetrics } from './types';

export interface NgCrossingInput {
  ngEntries: BrokerSummaryEntry[];
  rgEntries: BrokerSummaryEntry[];
  avgDailyRgValue?: number; // 20d or 50d benchmark turnover on regular board (IDR)
  significanceThresholdValue?: number; // Default 5 Billion IDR (5_000_000_000)
}

/**
 * Evaluates Negotiated Board (Pasar Nego / NG) block trades and correlates them
 * with Regular Board (RG) flow.
 *
 * Implements Metric 4 of IDX Insider Accumulation:
 * - Significant NG crossings (> 5B IDR or > 20% of average daily RG turnover)
 * - Identifies key crossing broker codes
 * - Scores follow-through accumulation on the Regular Board (RG) by the same brokers
 */
export function calculateNgCrossing(input: NgCrossingInput): NgCrossingMetrics {
  const {
    ngEntries = [],
    rgEntries = [],
    avgDailyRgValue = 0,
    significanceThresholdValue = 5_000_000_000, // 5 Milyar IDR
  } = input;

  const ngVolume = ngEntries.reduce((sum, e) => sum + e.buyVolume, 0);
  const ngValue = ngEntries.reduce((sum, e) => sum + e.buyValue, 0);

  // Crossing brokers: brokers with positive volume in NG
  const crossingBrokersSet = new Set<string>();
  for (const e of ngEntries) {
    if ((e.buyValue > 0 || e.sellValue > 0) && e.brokerCode) {
      crossingBrokersSet.add(e.brokerCode.toUpperCase().trim());
    }
  }
  const crossingBrokers = Array.from(crossingBrokersSet).sort();

  // Significant crossing condition:
  // ngValue >= 5B IDR OR (avgDailyRgValue > 0 and ngValue >= 0.20 * avgDailyRgValue)
  const meetsAbsoluteThreshold = ngValue >= significanceThresholdValue;
  const meetsRelativeThreshold = avgDailyRgValue > 0 && ngValue >= 0.2 * avgDailyRgValue;
  const hasSignificantCrossing = (meetsAbsoluteThreshold || meetsRelativeThreshold) && ngValue > 0;

  // RG follow-through score (0..1):
  // Check if crossing brokers are net buyers on RG
  let rgFollowThroughScore = 0;
  if (hasSignificantCrossing && crossingBrokers.length > 0 && rgEntries.length > 0) {
    const totalRgNetBuy = rgEntries
      .filter((e) => e.netValue > 0)
      .reduce((sum, e) => sum + e.netValue, 0);

    const crossingBrokersRgNetBuy = rgEntries
      .filter((e) => e.netValue > 0 && crossingBrokersSet.has(e.brokerCode.toUpperCase().trim()))
      .reduce((sum, e) => sum + e.netValue, 0);

    if (totalRgNetBuy > 0) {
      // Fraction of RG net buying driven by crossing brokers (capped at 1.0)
      rgFollowThroughScore = Math.min(1, Math.max(0, crossingBrokersRgNetBuy / totalRgNetBuy));
    }
  }

  return {
    ngVolume,
    ngValue: Number(ngValue.toFixed(2)),
    hasSignificantCrossing,
    crossingBrokers,
    rgFollowThroughScore: Number(rgFollowThroughScore.toFixed(4)),
  };
}
