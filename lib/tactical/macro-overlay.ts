/**
 * Phase 9 — Dynamic Macro Overlay for Pre-Market Battle Plans.
 *
 * Evaluates Rupiah spot pressure (USD/IDR velocity) and Bank Indonesia rate decisions (BI-Rate)
 * to adjust early volume confirmation thresholds ($V_{15m}$) and invalidation risk bands.
 *
 * Invariants:
 * - Fail-open: Missing or unavailable macro feeds degrade to MACRO_NEUTRAL.
 * - Does not invent stances: Only tightens or loosens execution parameters for existing ENTER/WAIT setups.
 */

export interface UsdIdrBar {
  date: string;
  close: number;
}

export interface BiRateDecision {
  meetingDate: string;
  rate: number;
  previousRate: number;
  action: 'HOLD' | 'HIKE' | 'CUT';
}

export interface RupiahPressureIndex {
  currentSpot: number;
  velocity5dPct: number;
  velocity20dPct: number;
  pressureScore: number; // 0 to 100
  isAboveCriticalThreshold: boolean;
}

export type MacroRegimeState = 'MACRO_HEADWIND' | 'MACRO_NEUTRAL' | 'MACRO_TAILWIND';

export interface MacroPressureResult {
  regime: MacroRegimeState;
  tightenInvalidationFactor: number;
  volumeMultiplier: number;
  summary: string;
}

export interface BattlePlanMacroInput {
  emiten: string;
  entryPrice: number;
  invalidationPrice: number;
  targetR1: number;
  v15mTargetShares: number;
}

export interface BattlePlanMacroAdjusted extends BattlePlanMacroInput {
  macroRegime: MacroRegimeState;
  adjustedInvalidationPrice: number;
  adjustedV15mShares: number;
}

/**
 * Calculates Rupiah Pressure Index (RPI) from USD/IDR historical closes.
 */
export function calculateRupiahPressureIndex(bars: UsdIdrBar[]): RupiahPressureIndex {
  if (!bars || bars.length < 2) {
    return {
      currentSpot: 0,
      velocity5dPct: 0,
      velocity20dPct: 0,
      pressureScore: 0,
      isAboveCriticalThreshold: false,
    };
  }

  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1].close;
  const tMinus5 = sorted[Math.max(0, sorted.length - 6)].close;
  const tMinus20 = sorted[Math.max(0, sorted.length - 21)].close;

  const velocity5dPct = Number((((latest - tMinus5) / tMinus5) * 100).toFixed(2));
  const velocity20dPct = Number((((latest - tMinus20) / tMinus20) * 100).toFixed(2));

  // Risk points
  let score = 20; // baseline neutral

  // 1. Psychological spot level
  if (latest >= 16500) score += 35;
  else if (latest >= 16200) score += 20;
  else if (latest <= 15500) score -= 15;

  // 2. 5-day velocity penalty / bonus
  if (velocity5dPct >= 2.0) score += 35;
  else if (velocity5dPct >= 1.0) score += 20;
  else if (velocity5dPct <= -1.0) score -= 10;

  // 3. 20-day velocity penalty / bonus
  if (velocity20dPct >= 4.0) score += 20;
  else if (velocity20dPct <= -2.0) score -= 10;

  const pressureScore = Math.max(0, Math.min(100, Math.round(score)));
  const isAboveCriticalThreshold = latest >= 16500 || velocity5dPct >= 2.5;

  return {
    currentSpot: latest,
    velocity5dPct,
    velocity20dPct,
    pressureScore,
    isAboveCriticalThreshold,
  };
}

/**
 * Combines RPI and BI-Rate status into an actionable MacroPressureResult.
 */
export function evaluateMacroPressureState(deps: {
  rpi: RupiahPressureIndex | null;
  latestBiDecision: BiRateDecision | null;
}): MacroPressureResult {
  const { rpi, latestBiDecision } = deps;

  if (!rpi && !latestBiDecision) {
    return {
      regime: 'MACRO_NEUTRAL',
      tightenInvalidationFactor: 1.0,
      volumeMultiplier: 1.0,
      summary: 'Data makro tidak tersedia — fallback netral',
    };
  }

  const isHike = latestBiDecision?.action === 'HIKE';
  const isCut = latestBiDecision?.action === 'CUT';
  const isSevereRpi = rpi ? rpi.pressureScore >= 70 || rpi.isAboveCriticalThreshold : false;
  const isFavorableRpi = rpi ? rpi.pressureScore <= 30 && rpi.velocity5dPct < 0 : false;

  if (isSevereRpi || isHike) {
    return {
      regime: 'MACRO_HEADWIND',
      tightenInvalidationFactor: 0.85, // tighter stop
      volumeMultiplier: 1.33, // requires 20% ADV confirmation instead of 15%
      summary: `Tekanan makro tinggi (${isSevereRpi ? 'Depresiasi Rupiah' : ''}${isSevereRpi && isHike ? ' + ' : ''}${isHike ? 'BI-Rate Kenaikan' : ''}). Terapkan stop ketat & volume konfirmasi lebih tinggi.`,
    };
  }

  if (isFavorableRpi || isCut) {
    return {
      regime: 'MACRO_TAILWIND',
      tightenInvalidationFactor: 1.0,
      volumeMultiplier: 1.0,
      summary: 'Kondisi makro kondusif. Likuiditas pasar dan sentimen Rupiah stabil/menguat.',
    };
  }

  return {
    regime: 'MACRO_NEUTRAL',
    tightenInvalidationFactor: 1.0,
    volumeMultiplier: 1.0,
    summary: 'Sentimen makro dan nilai tukar Rupiah dalam rentang wajar konsolidasi.',
  };
}

/**
 * Applies macro regime overlay directly to a pre-market battle plan row.
 */
export function applyMacroOverlayToBattlePlan(
  plan: BattlePlanMacroInput,
  macroState: MacroPressureResult
): BattlePlanMacroAdjusted {
  const baseRiskDistance = plan.entryPrice - plan.invalidationPrice;
  const adjustedRiskDistance = Math.round(baseRiskDistance * macroState.tightenInvalidationFactor);
  const adjustedInvalidationPrice = plan.entryPrice - adjustedRiskDistance;
  const adjustedV15mShares = Math.round(plan.v15mTargetShares * macroState.volumeMultiplier);

  return {
    ...plan,
    macroRegime: macroState.regime,
    adjustedInvalidationPrice,
    adjustedV15mShares,
  };
}
