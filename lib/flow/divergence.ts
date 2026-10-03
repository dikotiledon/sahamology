import { DivergenceRegime } from './types';

export interface DivergenceInput {
  adtv20d: number;
  foreignNetVal5d: number;
  retailNetVal5d: number;
  domesticInstNetVal5d: number;
  totalTurnover5d?: number;
  foreignGrossTurnover5d?: number;
}

export interface DivergenceResult {
  regime: DivergenceRegime;
  isBullishDivergence: boolean;
  effectiveWhaleThreshold: number;
  description: string;
}

/**
 * Classifies foreign vs domestic whale divergence regimes with dynamic
 * ADTV-relative liquidity floors.
 */
export function classifyDivergenceRegime(input: DivergenceInput): DivergenceResult {
  const {
    adtv20d,
    foreignNetVal5d,
    retailNetVal5d,
    domesticInstNetVal5d,
    totalTurnover5d = 0,
    foreignGrossTurnover5d,
  } = input;

  // Minimum floor is 500M IDR, or 10% of 20-day Average Daily Turnover
  const effectiveWhaleThreshold = Math.max(500_000_000, 0.10 * adtv20d);

  // Check domestic driven first if foreign gross turnover is under 5%
  if (
    foreignGrossTurnover5d !== undefined &&
    totalTurnover5d > 0 &&
    foreignGrossTurnover5d / totalTurnover5d < 0.05
  ) {
    return {
      regime: 'DOMESTIC_DRIVEN',
      isBullishDivergence: false,
      effectiveWhaleThreshold,
      description: 'Foreign participation is negligible (<5% turnover); movement is domestic-driven.',
    };
  }

  // Check liquidity floor
  const maxActivity = Math.max(
    Math.abs(foreignNetVal5d),
    Math.abs(retailNetVal5d),
    Math.abs(domesticInstNetVal5d)
  );

  if (maxActivity < effectiveWhaleThreshold) {
    return {
      regime: 'INSUFFICIENT_LIQUIDITY',
      isBullishDivergence: false,
      effectiveWhaleThreshold,
      description: 'Institutional flow is below the minimum liquidity floor.',
    };
  }

  // Synchronized Accumulation: Both foreign and domestic institutional cohorts buying together
  if (
    foreignNetVal5d >= effectiveWhaleThreshold &&
    domesticInstNetVal5d >= effectiveWhaleThreshold &&
    retailNetVal5d <= 0
  ) {
    return {
      regime: 'SYNCHRONIZED_ACCUMULATION',
      isBullishDivergence: true,
      effectiveWhaleThreshold,
      description: 'Both foreign and domestic institutional funds accumulating in tandem.',
    };
  }

  // Whale Absorption: Foreign Whales Net Buying > threshold AND Retail Net Selling < 0
  if (foreignNetVal5d >= effectiveWhaleThreshold && retailNetVal5d < 0) {
    return {
      regime: 'WHALE_ABSORPTION',
      isBullishDivergence: true,
      effectiveWhaleThreshold,
      description: 'Foreign institutions aggressively absorbing supply while retail sells into support.',
    };
  }

  // Retail Trap: Retail buying dominates while foreign whales net dump
  if (retailNetVal5d >= effectiveWhaleThreshold && foreignNetVal5d < 0) {
    return {
      regime: 'RETAIL_TRAP',
      isBullishDivergence: false,
      effectiveWhaleThreshold,
      description: 'Retail crowd net buying while institutional whales offload inventory.',
    };
  }

  return {
    regime: 'NEUTRAL',
    isBullishDivergence: false,
    effectiveWhaleThreshold,
    description: 'No clear divergence between institutional and retail participants.',
  };
}
