import { AbsorptionTag } from './types';

export interface AbsorptionInput {
  top3Concentration5d: number;
  netValue1d: number;
  netValue3d: number;
  netValue5d: number;
  priceReturn5dPct: number;
  barsCount: number;
}

export interface AbsorptionResult {
  score: number;
  tag: AbsorptionTag;
  historyStatus: 'COMPLETE' | 'INCOMPLETE_HISTORY';
  breakdown: {
    concentrationScore: number;
    persistenceScore: number;
    divergenceScore: number;
  };
}

/**
 * Calculates deterministic Accumulation Quality Score (AQS: 0-100)
 * and assigns an institutional absorption tag.
 */
export function calculateAbsorptionScore(input: AbsorptionInput): AbsorptionResult {
  const {
    top3Concentration5d,
    netValue1d,
    netValue3d,
    netValue5d,
    priceReturn5dPct,
    barsCount,
  } = input;

  const historyStatus = barsCount >= 5 ? 'COMPLETE' : 'INCOMPLETE_HISTORY';

  // 1. Concentration Component (0 - 30 points)
  let concentrationScore = 10;
  if (top3Concentration5d >= 0.50) {
    concentrationScore = 30;
  } else if (top3Concentration5d >= 0.35) {
    concentrationScore = 20;
  }

  // 2. Flow Persistence Component (0 - 30 points)
  let persistenceScore = 0;
  const positiveWindows = [netValue1d > 0, netValue3d > 0, netValue5d > 0].filter(Boolean).length;
  if (positiveWindows === 3) {
    persistenceScore = 30;
  } else if (positiveWindows === 2) {
    persistenceScore = 15;
  }

  // 3. Absorption Divergence Component (0 - 40 points)
  // Stealth base building: whales buying into flat/drifting price
  let divergenceScore = 0;
  if (netValue5d > 0) {
    if (priceReturn5dPct >= -5.0 && priceReturn5dPct <= 3.0) {
      // Stealth absorption into support
      divergenceScore = 40;
    } else if (priceReturn5dPct > 3.0 && priceReturn5dPct <= 15.0) {
      // Standard markup
      divergenceScore = 25;
    } else if (priceReturn5dPct > 15.0) {
      // Overextended markup
      divergenceScore = 10;
    }
  }

  const rawScore = concentrationScore + persistenceScore + divergenceScore;
  const score = Math.min(100, Math.max(0, rawScore));

  // Tag classification
  let tag: AbsorptionTag = 'NEUTRAL';
  if (score >= 75) {
    tag = 'HEAVY_ABSORPTION';
  } else if (score >= 60) {
    tag = 'MODERATE_ABSORPTION';
  } else if (score < 40) {
    tag = netValue5d < 0 ? 'DISTRIBUTION' : 'CHURNING';
  }

  return {
    score,
    tag,
    historyStatus,
    breakdown: {
      concentrationScore,
      persistenceScore,
      divergenceScore,
    },
  };
}
