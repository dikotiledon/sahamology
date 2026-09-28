/**
 * Phase 2 walk-forward arithmetic (plan Task 9, C18/C19/C20).
 *
 * PURE functions only — no database, no clock, no network. The reporter script
 * supplies the data; everything decidable is decided here so it is unit
 * testable without Postgres (the plan requires exactly that).
 *
 * Three contracts, all of which the cycle-1 audit found missing or undefined:
 *
 *  1. §6.1 — ONE denominator. The first draft specified three coverage rates
 *     without saying what they were rates OF. The same 5-unknowns dataset
 *     passed at 5.0% and failed at 25.0% by denominator choice alone.
 *     `computeMicroCoverage` fixes E before any gating, so the number cannot be
 *     selected to flatter a result.
 *
 *  2. D17 — VERDICT_UNREACHABLE. The 30-ENTER floor composes with the
 *     0.60 no-collapse guard: enterN(2) must reach 50 before a Phase 2 verdict
 *     is even measurable, which at 8 emitens is ~300 unique dates (~14 months).
 *     Reporting FAIL for that whole period would be a false claim about the
 *     code, and it would train the operator to ignore FAIL.
 *
 *  3. Never fabricate a number. An empty system has null expectancy and null
 *     PF, not 0 and not Infinity. A null comparison is a FAIL, not a pass.
 */

import { roundTripCostRate, type CostModel } from './costs';

export type ShipVerdict = 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';

/** The composed sample floors (D17). Derived, not guessed — see the audit. */
export const SAMPLE_FEASIBILITY = {
  /** D10 condition (3). */
  minOosEnterPhase2: 30,
  /** D10 condition (4) forces enterN(2) >= ceil(30 / 0.60) = 50. */
  minOosEnterPhase1: Math.ceil(30 / 0.6),
  /** D10 condition (4). */
  noCollapseRatio: 0.6,
} as const;

/** D10 coverage bounds (5)(6)(7). */
export const COVERAGE_BOUNDS = {
  maxAccdistUnknownRate: 0.1,
  minFlowCoverageRate: 0.8,
  maxUnscoredShare: 0.25,
} as const;

/** One row of the pre-gated eligible set E (§6.1). */
export interface CoverageRow {
  accdistState: 'ACC' | 'SMALL_ACC' | 'NEUTRAL' | 'SMALL_DIST' | 'DIST' | 'UNKNOWN';
  /** Did system (3) actually evaluate the flow gate? NOT_EVALUATED counts as false. */
  flowEvaluated: boolean;
  /** Did system (3) produce a scored R-multiple? */
  scored: boolean;
  /** Phase 1 already accounts for these; they must not be charged twice. */
  unscoredReason?: 'truncated-horizon' | 'fail-closed-book';
}

export interface CoverageSummary {
  denominator: number;
  accdistUnknownRate: number;
  flowCoverageRate: number;
  unscoredShare: number;
}

/**
 * §6.1 denominator contract. `E` is the OOS eligible set, fixed BEFORE any
 * gating is applied. An empty E yields zeros rather than NaN.
 */
export function computeMicroCoverage(rows: readonly CoverageRow[]): CoverageSummary {
  const denominator = rows.length;
  if (denominator === 0) {
    return { denominator: 0, accdistUnknownRate: 0, flowCoverageRate: 0, unscoredShare: 0 };
  }
  const unknown = rows.filter((r) => r.accdistState === 'UNKNOWN').length;
  const flowOk = rows.filter((r) => r.flowEvaluated).length;
  // D12 vs D10(7): "unscored" here means the micro layer lacked data, not that
  // a truncated horizon or fail-closed book removed the trade. Those are already
  // counted by the Phase 1 reporter and charging them again makes the cap
  // unsatisfiable.
  const unscored = rows.filter((r) => !r.scored && r.unscoredReason === undefined).length;

  return {
    denominator,
    accdistUnknownRate: unknown / denominator,
    flowCoverageRate: flowOk / denominator,
    unscoredShare: unscored / denominator,
  };
}

export interface SystemScore {
  /** ENTER stances produced by this system. This is what D10(3)/(4) measure. */
  enterN: number;
  /** ENTER stances that also produced a finite R-multiple. */
  scoredN: number;
  /** Mean R-multiple, or null when nothing was scored. Never 0 for "no data". */
  expectancyR: number | null;
  /** Gross profit / gross loss, or null when there are no losses (never Infinity). */
  profitFactor: number | null;
  winRate: number | null;
  maxDrawdownR: number | null;
}

/**
 * Score one system from its R-multiples (already net of costs — D11 scores via
 * `scorePath`, which applies `roundTripCostRate` itself).
 *
 * `enterN` defaults to the scored count but can be supplied separately. This
 * matters: D10(3)/(4) count ENTER stances, while expectancy/PF are computed
 * only over the scored subset. A system that emitted 40 ENTERs but scored 35
 * has enterN=40, NOT 35 — deriving enterN from `r.length` would silently make
 * the 30-ENTER floor and the 0.60 no-collapse ratio measure scored trades
 * instead of entries, which is a different and easier-to-game quantity.
 */
export function scoreSystem(rMultiples: readonly number[], enterNOverride?: number): SystemScore {
  const scored = rMultiples.filter((r) => Number.isFinite(r));
  const scoredN = scored.length;
  const enterN = enterNOverride ?? scoredN;
  if (scoredN === 0) {
    return { enterN, scoredN: 0, expectancyR: null, profitFactor: null, winRate: null, maxDrawdownR: null };
  }

  const net = scored.reduce((s, r) => s + r, 0);
  const wins = scored.filter((r) => r > 0);
  const losses = scored.filter((r) => r < 0);
  const grossProfit = wins.reduce((s, r) => s + r, 0);
  const grossLoss = Math.abs(losses.reduce((s, r) => s + r, 0));

  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const r of scored) {
    equity += r;
    if (equity > peak) peak = equity;
    maxDd = Math.max(maxDd, peak - equity);
  }

  return {
    enterN,
    scoredN,
    expectancyR: net / scoredN,
    // Gross profit over gross loss, which is what "profit factor" means
    // everywhere else. It is NOT net over gross loss: that variant makes the
    // ratio equal to 1 + expectancy/grossLoss, so it is bounded below by 1 for
    // any profitable system, collapses to 0 for a breakeven one, and ranks a
    // system with one 10R win and one 1R loss (10.0) BELOW one with nine 1R
    // wins and one 1R loss (9.0) — inverting the very comparison the ship gate
    // makes when it requires PF(3) >= PF(2).
    //
    // No losses means the ratio is undefined, not infinite. null keeps a
    // no-loss system from silently "passing" a PF comparison against a
    // defined number.
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    winRate: wins.length / scoredN,
    maxDrawdownR: maxDd,
  };
}

export interface ShipConditions {
  beatExpectancy: boolean;
  beatPF: boolean;
  sampleFloorMet: boolean;
  noCollapse: boolean;
  accdistCoverageMet: boolean;
  flowCoverageMet: boolean;
  unscoredCapMet: boolean;
}

/**
 * Phase 3 coverage. D13: this is a SEPARATE type, and the Phase 3 gate is a
 * separate function. `ShipConditions` above is frozen — Phase 2's eight
 * conditions are the ones the Phase 2 reporter prints, and widening it here
 * would silently change what an already-shipped report means.
 */
export interface FundamentalCoverage {
  /** Share of E with a scored fundamental reading. */
  fundamentalsScoredRate: number;
  /** Share of E left unscored because the capture was degraded. */
  fundamentalsIncompleteRate: number;
}

export interface ShipGateResult {
  verdict: ShipVerdict;
  sampleFeasible: boolean;
  conditions: ShipConditions;
  oosEnterPhase1: number;
  oosEnterPhase2: number;
  reasons: string[];
}

/**
 * D10 + D17. Systems (2) and (3) are PAIRED on identical signals, so only
 * (3) vs (2) gates.
 */
export function evaluateShipGate(args: {
  coverage: CoverageSummary;
  phase1: SystemScore;
  phase2: SystemScore;
}): ShipGateResult {
  const { coverage, phase1, phase2 } = args;
  const reasons: string[] = [];

  // D17: distinguish "not yet measurable" from "measured a collapse".
  //
  // The sample is too early to judge when EITHER floor cannot be evaluated:
  //  - system (2) has fewer than 50 OOS ENTERs, so condition (4)'s 0.60 ratio
  //    has no meaningful baseline to compare against; or
  //  - system (3) has not reached the 30-ENTER floor, so there is nothing to
  //    score yet.
  //
  // Once BOTH are satisfiable, a noCollapse failure is a REAL, measured
  // failure — the Phase 2 gate filtered too aggressively. Reporting that as
  // "unreachable" would let a collapsing gate hide behind the sample-size
  // excuse indefinitely, which is the exact failure mode D17 was written to
  // prevent.
  const phase1HasSignal = phase1.enterN >= SAMPLE_FEASIBILITY.minOosEnterPhase1;
  const sampleFloorMet = phase2.enterN >= SAMPLE_FEASIBILITY.minOosEnterPhase2;
  const noCollapse = phase2.enterN >= SAMPLE_FEASIBILITY.noCollapseRatio * phase1.enterN;
  const sampleFeasible = sampleFloorMet && phase1HasSignal;

  const beatExpectancy =
    phase1.expectancyR !== null &&
    phase2.expectancyR !== null &&
    phase2.expectancyR > phase1.expectancyR;
  const beatPF =
    phase1.profitFactor !== null &&
    phase2.profitFactor !== null &&
    phase2.profitFactor >= phase1.profitFactor;
  const accdistCoverageMet = coverage.accdistUnknownRate <= COVERAGE_BOUNDS.maxAccdistUnknownRate;
  const flowCoverageMet = coverage.flowCoverageRate >= COVERAGE_BOUNDS.minFlowCoverageRate;
  const unscoredCapMet = coverage.unscoredShare <= COVERAGE_BOUNDS.maxUnscoredShare;

  const conditions: ShipConditions = {
    beatExpectancy,
    beatPF,
    sampleFloorMet,
    noCollapse,
    accdistCoverageMet,
    flowCoverageMet,
    unscoredCapMet,
  };

  if (!beatExpectancy) reasons.push('expectancy(3) did not beat expectancy(2)');
  if (!beatPF) reasons.push('PF(3) did not reach PF(2)');
  if (!sampleFloorMet) {
    reasons.push(`enterN(3)=${phase2.enterN} below the ${SAMPLE_FEASIBILITY.minOosEnterPhase2} floor`);
  }
  if (!noCollapse) {
    reasons.push(
      `enterN(3)=${phase2.enterN} below ${SAMPLE_FEASIBILITY.noCollapseRatio} x enterN(2)=${phase1.enterN} (sample collapse)`,
    );
  }
  if (!accdistCoverageMet) reasons.push(`accdistUnknownRate ${coverage.accdistUnknownRate.toFixed(3)} > 0.10`);
  if (!flowCoverageMet) reasons.push(`flowCoverageRate ${coverage.flowCoverageRate.toFixed(3)} < 0.80`);
  if (!unscoredCapMet) reasons.push(`unscoredShare ${coverage.unscoredShare.toFixed(3)} > 0.25`);

  const verdict: ShipVerdict = !sampleFeasible
    ? 'VERDICT_UNREACHABLE'
    : Object.values(conditions).every(Boolean)
      ? 'PASS'
      : 'FAIL';

  return {
    verdict,
    sampleFeasible,
    conditions,
    oosEnterPhase1: phase1.enterN,
    oosEnterPhase2: phase2.enterN,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 ship gate (D13)
// ---------------------------------------------------------------------------

export const FUNDAMENTAL_BOUNDS = {
  /** A landmine veto that fires on more than a tenth of the universe is a bug. */
  maxVetoRate: 0.1,
  /**
   * D12-adjacent: the Phase 3 comparison is only meaningful if most signals
   * actually got a reading. Below this the treatment was not applied to most of
   * E, and "Phase 3 beat Phase 2" would really mean "we dropped the hard rows".
   */
  minFundamentalsScoredRate: 0.9,
  /**
   * Degraded captures are repairable but must not silently become a scored
   * sample. This mirrors the Phase 2 unscored cap.
   */
  maxFundamentalsIncompleteRate: 0.25,
} as const;

export const PHASE3_SAMPLE_FEASIBILITY = {
  /** Same 30-ENTER floor as Phase 2. */
  minOosEnterPhase3: 30,
  /**
   * The 0.60 no-collapse guard is measured against the Phase 2 baseline, so
   * that baseline must itself clear 30 / 0.60 = 50 OOS ENTERs before the ratio
   * means anything.
   */
  minOosEnterPhase2Baseline: Math.ceil(30 / 0.6),
  noCollapseRatio: 0.6,
} as const;

export interface Phase3ShipConditions {
  beatExpectancy: boolean;
  beatPF: boolean;
  sampleFloorMet: boolean;
  noCollapse: boolean;
  fundamentalsCoverageMet: boolean;
  incompleteCapMet: boolean;
  vetoPlausibilityMet: boolean;
  unscoredCapMet: boolean;
}

export interface Phase3ShipGateResult {
  verdict: ShipVerdict;
  sampleFeasible: boolean;
  conditions: Phase3ShipConditions;
  oosEnterPhase2: number;
  oosEnterPhase3: number;
  vetoed: number;
  reasons: string[];
}

/**
 * The Phase 3 gate, PAIRED against the Phase 2 baseline on identical signals.
 *
 * Written as its own function rather than as an extra field on
 * `evaluateShipGate` so that the Phase 2 path cannot change behaviour. D13 was
 * an explicit decision: an additive parameter would have been tidier, but it
 * would put a Phase 3 concept inside the function that already produces the
 * shipped Phase 2 verdict, and a caller that forgot to pass it would get a
 * silent PASS-shaped result.
 *
 * Note the asymmetry in the two "cannot judge" tests. `sampleFeasible` is false
 * when EITHER floor is unmet, so an early sample yields VERDICT_UNREACHABLE
 * and never a FAIL. Once both are met, a noCollapse failure is a REAL measured
 * failure and must read as FAIL — otherwise a collapsing gate could hide behind
 * the sample-size excuse indefinitely.
 */
export function evaluatePhase3ShipGate(args: {
  coverage: CoverageSummary;
  fundamentalCoverage: FundamentalCoverage;
  phase2: SystemScore;
  phase3: SystemScore;
  /** ENTERs on system (3) that the G5 veto removed, for the plausibility check. */
  vetoed: number;
}): Phase3ShipGateResult {
  const { coverage, fundamentalCoverage, phase2, phase3, vetoed } = args;
  const reasons: string[] = [];

  const baselineHasSignal = phase2.enterN >= PHASE3_SAMPLE_FEASIBILITY.minOosEnterPhase2Baseline;
  const sampleFloorMet = phase3.enterN >= PHASE3_SAMPLE_FEASIBILITY.minOosEnterPhase3;
  const noCollapse = phase3.enterN >= PHASE3_SAMPLE_FEASIBILITY.noCollapseRatio * phase2.enterN;
  const sampleFeasible = sampleFloorMet && baselineHasSignal;

  const beatExpectancy =
    phase2.expectancyR !== null &&
    phase3.expectancyR !== null &&
    phase3.expectancyR > phase2.expectancyR;
  const beatPF =
    phase2.profitFactor !== null &&
    phase3.profitFactor !== null &&
    phase3.profitFactor >= phase2.profitFactor;

  const fundamentalsCoverageMet =
    fundamentalCoverage.fundamentalsScoredRate >= FUNDAMENTAL_BOUNDS.minFundamentalsScoredRate;
  const incompleteCapMet =
    fundamentalCoverage.fundamentalsIncompleteRate <= FUNDAMENTAL_BOUNDS.maxFundamentalsIncompleteRate;
  const unscoredCapMet = coverage.unscoredShare <= COVERAGE_BOUNDS.maxUnscoredShare;

  // A veto rate is only interpretable once the sample can support it. Before
  // the floor, "0 vetoes" is what a tiny sample looks like, not a clean bill of
  // health — so this is deliberately NOT part of `sampleFeasible`, and a
  // high-veto verdict on a small sample is reported in `reasons` rather than
  // being allowed to drive the verdict on its own.
  const scoredN = phase3.enterN + vetoed;
  const vetoRate = scoredN > 0 ? vetoed / scoredN : 0;
  const vetoPlausibilityMet = vetoRate <= FUNDAMENTAL_BOUNDS.maxVetoRate;

  const conditions: Phase3ShipConditions = {
    beatExpectancy,
    beatPF,
    sampleFloorMet,
    noCollapse,
    fundamentalsCoverageMet,
    incompleteCapMet,
    vetoPlausibilityMet,
    unscoredCapMet,
  };

  if (!beatExpectancy) reasons.push('expectancy(3) did not beat expectancy(2)');
  if (!beatPF) reasons.push('PF(3) did not reach PF(2)');
  if (!sampleFloorMet) {
    reasons.push(
      `enterN(3)=${phase3.enterN} below the ${PHASE3_SAMPLE_FEASIBILITY.minOosEnterPhase3} floor`,
    );
  }
  if (!noCollapse) {
    reasons.push(
      `enterN(3)=${phase3.enterN} below ${PHASE3_SAMPLE_FEASIBILITY.noCollapseRatio} x enterN(2)=${phase2.enterN} (sample collapse)`,
    );
  }
  if (!fundamentalsCoverageMet) {
    reasons.push(
      `fundamentalsScoredRate ${fundamentalCoverage.fundamentalsScoredRate.toFixed(3)} < ${FUNDAMENTAL_BOUNDS.minFundamentalsScoredRate}`,
    );
  }
  if (!incompleteCapMet) {
    reasons.push(
      `fundamentalsIncompleteRate ${fundamentalCoverage.fundamentalsIncompleteRate.toFixed(3)} > ${FUNDAMENTAL_BOUNDS.maxFundamentalsIncompleteRate}`,
    );
  }
  if (!vetoPlausibilityMet) {
    reasons.push(`vetoRate ${vetoRate.toFixed(3)} > ${FUNDAMENTAL_BOUNDS.maxVetoRate}`);
  }
  if (!unscoredCapMet) reasons.push(`unscoredShare ${coverage.unscoredShare.toFixed(3)} > 0.25`);

  const verdict: ShipVerdict = !sampleFeasible
    ? 'VERDICT_UNREACHABLE'
    : Object.values(conditions).every(Boolean)
      ? 'PASS'
      : 'FAIL';

  return {
    verdict,
    sampleFeasible,
    conditions,
    oosEnterPhase2: phase2.enterN,
    oosEnterPhase3: phase3.enterN,
    vetoed,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Phase 4 ship gate (D14)
// ---------------------------------------------------------------------------

export const MACRO_BOUNDS = {
  /**
   * A G7 hold that fires on more than a third of entries is a bug, not a
   * regime. The bound is LOOSER than the Phase 3 veto cap (0.10) on purpose:
   * G7 is a contextual overlay, not a filter, so a well-calibrated bound may
   * legitimately hold a meaningful share of otherwise-valid setups. What it
   * must never do is hold nearly all of them — that is collapse, and the
   * noCollapse condition already catches it.
   */
  maxHoldRate: 1 / 3,
  /**
   * The Phase 4 comparison is only meaningful if most signals actually got a
   * regime reading. Below this, "Phase 4 beat Phase 3" would really mean "we
   * dropped the rows that happened to fall on calm days" — and since macro
   * state is exactly what selects for adverse days, that is not a neutral
   * sample loss, it is a survivorship bias pointed the wrong way.
   */
  minMacroScoredRate: 0.9,
  /**
   * Degraded macro captures are repairable but must not silently become a
   * scored sample. Mirrors the Phase 2 and Phase 3 caps.
   */
  maxMacroIncompleteRate: 0.25,
} as const;

export const PHASE4_SAMPLE_FEASIBILITY = {
  /** Same 30-ENTER floor as every prior phase. */
  minOosEnterPhase4: 30,
  /**
   * The 0.60 no-collapse guard is measured against the Phase 3 baseline, so
   * that baseline must itself clear 30 / 0.60 = 50 OOS ENTERs before the ratio
   * means anything.
   */
  minOosEnterPhase3Baseline: Math.ceil(30 / 0.6),
  noCollapseRatio: 0.6,
} as const;

export interface Phase4ShipConditions {
  beatExpectancy: boolean;
  beatPF: boolean;
  sampleFloorMet: boolean;
  noCollapse: boolean;
  macroCoverageMet: boolean;
  incompleteCapMet: boolean;
  raisePlausibilityMet: boolean;
  unscoredCapMet: boolean;
}

export interface Phase4ShipGateResult {
  verdict: ShipVerdict;
  sampleFeasible: boolean;
  conditions: Phase4ShipConditions;
  oosEnterPhase3: number;
  oosEnterPhase4: number;
  held: number;
  holdRate: number;
  reasons: string[];
}

/** Phase 4 coverage, mirroring {@link FundamentalCoverage} for the macro layer. */
export interface MacroCoverage {
  /** Share of the eligible set that got a scored regime reading. */
  macroScoredRate: number;
  /** Share of the eligible set whose macro capture degraded. */
  macroIncompleteRate: number;
}

/**
 * The Phase 4 gate, PAIRED against the Phase 3 baseline on identical signals.
 *
 * Written as its own function for the same D13 reason as Phase 3: an additive
 * parameter would put a Phase 4 concept inside the function that produces the
 * shipped Phase 2 and Phase 3 verdicts, and a caller that forgot to pass it
 * would get a silent PASS-shaped result.
 *
 * The `raisePlausibilityMet` condition replaces Phase 3's veto cap and is
 * deliberately NOT part of `sampleFeasible`. A hold rate is only interpretable
 * once the sample can support it — before the floor, "0 holds" is what a tiny
 * sample looks like, not a clean bill of health.
 */
export function evaluatePhase4ShipGate(args: {
  coverage: CoverageSummary;
  macroCoverage: MacroCoverage;
  phase3: SystemScore;
  phase4: SystemScore;
  /** ENTERs on system (4) that the G7 hold removed, for the plausibility check. */
  held: number;
}): Phase4ShipGateResult {
  const { coverage, macroCoverage, phase3, phase4, held } = args;
  const reasons: string[] = [];

  const baselineHasSignal = phase3.enterN >= PHASE4_SAMPLE_FEASIBILITY.minOosEnterPhase3Baseline;
  const sampleFloorMet = phase4.enterN >= PHASE4_SAMPLE_FEASIBILITY.minOosEnterPhase4;
  const noCollapse = phase4.enterN >= PHASE4_SAMPLE_FEASIBILITY.noCollapseRatio * phase3.enterN;
  const sampleFeasible = sampleFloorMet && baselineHasSignal;

  const beatExpectancy =
    phase3.expectancyR !== null &&
    phase4.expectancyR !== null &&
    phase4.expectancyR > phase3.expectancyR;
  const beatPF =
    phase3.profitFactor !== null &&
    phase4.profitFactor !== null &&
    phase4.profitFactor >= phase3.profitFactor;

  const macroCoverageMet = macroCoverage.macroScoredRate >= MACRO_BOUNDS.minMacroScoredRate;
  const incompleteCapMet =
    macroCoverage.macroIncompleteRate <= MACRO_BOUNDS.maxMacroIncompleteRate;
  const unscoredCapMet = coverage.unscoredShare <= COVERAGE_BOUNDS.maxUnscoredShare;

  // A hold rate is only interpretable once the sample can support it. See the
  // Phase 3 note: deliberately NOT part of sampleFeasible.
  const scoredN = phase4.enterN + held;
  const holdRate = scoredN > 0 ? held / scoredN : 0;
  const raisePlausibilityMet = holdRate <= MACRO_BOUNDS.maxHoldRate;

  const conditions: Phase4ShipConditions = {
    beatExpectancy,
    beatPF,
    sampleFloorMet,
    noCollapse,
    macroCoverageMet,
    incompleteCapMet,
    raisePlausibilityMet,
    unscoredCapMet,
  };

  if (!beatExpectancy) reasons.push('expectancy(4) did not beat expectancy(3)');
  if (!beatPF) reasons.push('PF(4) did not reach PF(3)');
  if (!sampleFloorMet) {
    reasons.push(
      `enterN(4)=${phase4.enterN} below the ${PHASE4_SAMPLE_FEASIBILITY.minOosEnterPhase4} floor`,
    );
  }
  if (!noCollapse) {
    reasons.push(
      `enterN(4)=${phase4.enterN} below ${PHASE4_SAMPLE_FEASIBILITY.noCollapseRatio} x enterN(3)=${phase3.enterN} (sample collapse)`,
    );
  }
  if (!macroCoverageMet) {
    reasons.push(
      `macroScoredRate ${macroCoverage.macroScoredRate.toFixed(3)} < ${MACRO_BOUNDS.minMacroScoredRate}`,
    );
  }
  if (!incompleteCapMet) {
    reasons.push(
      `macroIncompleteRate ${macroCoverage.macroIncompleteRate.toFixed(3)} > ${MACRO_BOUNDS.maxMacroIncompleteRate}`,
    );
  }
  if (!raisePlausibilityMet) {
    reasons.push(`holdRate ${holdRate.toFixed(3)} > ${MACRO_BOUNDS.maxHoldRate.toFixed(3)}`);
  }
  if (!unscoredCapMet) reasons.push(`unscoredShare ${coverage.unscoredShare.toFixed(3)} > 0.25`);

  const verdict: ShipVerdict = !sampleFeasible
    ? 'VERDICT_UNREACHABLE'
    : Object.values(conditions).every(Boolean)
      ? 'PASS'
      : 'FAIL';

  return {
    verdict,
    sampleFeasible,
    conditions,
    oosEnterPhase3: phase3.enterN,
    oosEnterPhase4: phase4.enterN,
    held,
    holdRate,
    reasons,
  };
}

/** Re-exported so the reporter cannot drift from the scorer (D11). */
export { roundTripCostRate };
export type { CostModel };
