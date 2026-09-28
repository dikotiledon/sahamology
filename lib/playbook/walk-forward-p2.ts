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

  const gross = scored.reduce((s, r) => s + r, 0);
  const wins = scored.filter((r) => r > 0);
  const losses = scored.filter((r) => r < 0);
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
    expectancyR: gross / scoredN,
    // No losses means the ratio is undefined, not infinite. null keeps a
    // no-loss system from silently "passing" a PF comparison against a
    // defined number.
    profitFactor: grossLoss > 0 ? gross / grossLoss : null,
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

/** Re-exported so the reporter cannot drift from the scorer (D11). */
export { roundTripCostRate };
export type { CostModel };
