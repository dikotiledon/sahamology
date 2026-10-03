import type { TradeDisciplineReview } from './types';

export type TiltState = 'NORMAL' | 'CAUTION' | 'TILT_LOCKOUT';

export interface TraderTiltStatus {
  psychologicalCapitalPct: number;
  consecutiveViolations: number;
  tiltState: TiltState;
  advisory: string;
  lockoutRecommended: boolean;
}

export function updatePsychologicalCapital(
  currentCapitalPct: number,
  review: TradeDisciplineReview
): number {
  if (review.isDisciplined && review.deviations.length === 0) {
    // Clean disciplined trade: restore +5% psychological capital (capped at 100%)
    return Math.min(100, currentCapitalPct + 5);
  }

  let penalty = 0;
  for (const dev of review.deviations) {
    if (dev.severity === 'SEVERE') {
      penalty += 20;
    } else if (dev.severity === 'MODERATE') {
      penalty += 10;
    } else {
      penalty += 5;
    }
  }

  // Fallback to score delta if no explicit deviations logged
  if (penalty === 0 && review.disciplineScore < 100) {
    penalty = Math.max(5, Math.round((100 - review.disciplineScore) * 0.4));
  }

  return Math.max(0, currentCapitalPct - penalty);
}

export function evaluateTraderTilt(params: {
  currentCapitalPct: number;
  consecutiveViolations: number;
  recentReviews?: TradeDisciplineReview[];
}): TraderTiltStatus {
  const { currentCapitalPct, consecutiveViolations } = params;

  if (currentCapitalPct < 40 || consecutiveViolations >= 3) {
    return {
      psychologicalCapitalPct: currentCapitalPct,
      consecutiveViolations,
      tiltState: 'TILT_LOCKOUT',
      lockoutRecommended: true,
      advisory:
        'LOCKOUT ADVISORY: High emotional tilt detected (capital < 40% or 3+ consecutive violations). Trading desk locked for new risk. Mandatory cooling-off period required.',
    };
  }

  if (currentCapitalPct < 70 || consecutiveViolations >= 1) {
    return {
      psychologicalCapitalPct: currentCapitalPct,
      consecutiveViolations,
      tiltState: 'CAUTION',
      lockoutRecommended: false,
      advisory:
        'CAUTION: Psychological capital depleted or recent execution slippage. Downsize position risk to 50% lots and demand strict G0–G4 confluence.',
    };
  }

  return {
    psychologicalCapitalPct: currentCapitalPct,
    consecutiveViolations,
    tiltState: 'NORMAL',
    lockoutRecommended: false,
    advisory:
      'Optimal psychological state. Full playbook compliance active with standard risk allocations.',
  };
}
