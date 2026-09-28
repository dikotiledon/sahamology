import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMicroCoverage,
  evaluateShipGate,
  scoreSystem,
  SAMPLE_FEASIBILITY,
} from './walk-forward-p2';

/**
 * Pure arithmetic for the Phase 2 walk-forward (plan Task 9, C18/C19/C20).
 *
 * Two contracts are being pinned here, and both were added by the cycle-1
 * audit:
 *
 *  §6.1 — the three coverage rates had NO denominator in the first draft. The
 *  same 5-unknowns dataset passed at 5.0% and failed at 25.0% purely by
 *  denominator choice. `computeMicroCoverage` now takes ONE denominator — the
 *  pre-gated eligible set E — so the number cannot be chosen to flatter a
 *  result.
 *
 *  D17 — the 30-ENTER floor is unreachable until roughly 300 unique eligible
 *  dates (~14 months). A reporter that printed FAIL for that whole year would
 *  be making a false claim about the code. `evaluateShipGate` returns
 *  VERDICT_UNREACHABLE, a token distinct from FAIL, and the caller must not
 *  print a PASS/FAIL line with it.
 */

/**
 * A SystemScore literal needs every field. Only the three the gate reads are
 * load-bearing; the rest are display fields the gate never touches.
 */
const S = (enterN: number, expectancyR: number | null, profitFactor: number | null) => ({
  enterN,
  scoredN: enterN,
  expectancyR,
  profitFactor,
  winRate: enterN > 0 ? 0.5 : null,
  maxDrawdownR: enterN > 0 ? 1 : null,
});

describe('§6.1 — the three coverage rates share ONE denominator E', () => {
  const E = [
    { accdistState: 'ACC' as const, flowEvaluated: true, scored: true },
    { accdistState: 'ACC' as const, flowEvaluated: true, scored: true },
    { accdistState: 'UNKNOWN' as const, flowEvaluated: true, scored: true },
    { accdistState: 'ACC' as const, flowEvaluated: false, scored: false },
    { accdistState: 'ACC' as const, flowEvaluated: true, scored: true },
  ];

  it('computes all three over |E| = 5, not over a post-gated subset', () => {
    const c = computeMicroCoverage(E);
    assert.equal(c.denominator, 5, 'E is fixed BEFORE gating');
    assert.equal(c.accdistUnknownRate, 0.2);
    assert.equal(c.flowCoverageRate, 0.8);
    assert.equal(c.unscoredShare, 0.2);
  });

  it('a spike day that never evaluated flow COUNTS AGAINST coverage (D9 false-green)', () => {
    // If NOT_EVALUATED counted as "evaluated", an all-new-band universe would
    // report flowCoverageRate = 100% while the gate never ran — the exact
    // condition (6) exists to detect.
    const allSpikes = E.map(() => ({ accdistState: 'ACC' as const, flowEvaluated: false, scored: true }));
    assert.equal(computeMicroCoverage(allSpikes).flowCoverageRate, 0);
  });

  it('an empty E is 0 across the board, never NaN and never a division by zero', () => {
    const c = computeMicroCoverage([]);
    assert.equal(c.denominator, 0);
    assert.equal(c.accdistUnknownRate, 0);
    assert.equal(c.flowCoverageRate, 0);
    assert.equal(c.unscoredShare, 0);
  });

  it('unscoredShare excludes truncated horizons and fail-closed books (already counted by Phase 1)', () => {
    const rows = [
      { accdistState: 'ACC' as const, flowEvaluated: true, scored: true },
      { accdistState: 'ACC' as const, flowEvaluated: true, scored: true, unscoredReason: 'truncated-horizon' as const },
      { accdistState: 'ACC' as const, flowEvaluated: true, scored: true, unscoredReason: 'fail-closed-book' as const },
    ];
    assert.equal(computeMicroCoverage(rows).unscoredShare, 0, 'neither counts against the micro cap');
  });
});

describe('scoreSystem (D11 — same protocol for every system)', () => {
  it('counts ENTER stances separately from scored trades', () => {
    // 40 ENTER stances, 35 of which scored. D10(3) measures ENTERS, so the
    // floor must see 40 — deriving enterN from r.length would report 35 and
    // silently move the gate to a different (easier) quantity.
    const r = Array.from({ length: 35 }, (_, i) => (i % 2 === 0 ? 1.5 : -1));
    const s = scoreSystem(r, 40);
    assert.equal(s.enterN, 40);
    assert.equal(s.scoredN, 35);
    assert.equal(s.expectancyR, r.reduce((a, b) => a + b, 0) / 35);
  });

  it('keeps a real enterN even when nothing scored', () => {
    // Every ENTER had a zero-risk (unscorable) path. enterN is still a fact
    // about the system's behaviour, so it must survive an empty score set.
    const s = scoreSystem([], 12);
    assert.equal(s.enterN, 12);
    assert.equal(s.scoredN, 0);
    assert.equal(s.expectancyR, null);
  });

  it('defaults enterN to the scored count when no override is supplied', () => {
    assert.equal(scoreSystem([1, 2]).enterN, 2);
  });
  it('averages R-multiples, computes PF, and never fabricates a 0R for an empty path', () => {
    const s = scoreSystem([1.5, -1, 2, 1.25]);
    assert.equal(s.scoredN, 4);
    assert.equal(s.enterN, 4);
    assert.ok(s.expectancyR !== null && Math.abs(s.expectancyR - (1.5 - 1 + 2 + 1.25) / 4) < 1e-9);
    assert.ok(s.profitFactor !== null && s.profitFactor > 0);
  });

  it('an empty set yields nulls, never 0 expectancy that would look like a real measurement', () => {
    const s = scoreSystem([]);
    assert.equal(s.scoredN, 0);
    assert.equal(s.enterN, 0);
    assert.equal(s.expectancyR, null);
    assert.equal(s.profitFactor, null);
  });

  it('PF is null when there are no losses, so a 0 is not fabricated as Infinity', () => {
    assert.equal(scoreSystem([1, 2, 3]).profitFactor, null);
  });
});

describe('D17 — the sample floor composes with the no-collapse guard', () => {
  it('declares the composed requirement of 50 OOS ENTERs for system (2)', () => {
    assert.equal(SAMPLE_FEASIBILITY.minOosEnterPhase1, 50, 'condition 4 forces enterN(2) >= 50');
    assert.equal(SAMPLE_FEASIBILITY.minOosEnterPhase2, 30);
    assert.equal(SAMPLE_FEASIBILITY.noCollapseRatio, 0.6);
  });

  it('is VERDICT_UNREACHABLE when the sample cannot satisfy (3) and (4) together', () => {
    const gate = evaluateShipGate({
      coverage: { denominator: 40, accdistUnknownRate: 0, flowCoverageRate: 1, unscoredShare: 0 },
      phase1: S(10, 0.2, 1.4),
      phase2: S(8, 0.3, 1.5),
    });
    assert.equal(gate.verdict, 'VERDICT_UNREACHABLE');
    assert.equal(gate.sampleFeasible, false);
  });

  it('a small sample that WOULD satisfy both floors is evaluated, not skipped', () => {
    const gate = evaluateShipGate({
      coverage: { denominator: 40, accdistUnknownRate: 0, flowCoverageRate: 1, unscoredShare: 0 },
      phase1: S(50, 0.2, 1.4),
      phase2: S(30, 0.3, 1.5),
    });
    assert.notEqual(gate.verdict, 'VERDICT_UNREACHABLE');
    assert.equal(gate.sampleFeasible, true);
  });
});

describe('D10 — all seven conditions, OOS fold only', () => {
  const goodCoverage = { denominator: 300, accdistUnknownRate: 0.05, flowCoverageRate: 0.9, unscoredShare: 0.1 };

  it('PASS requires all seven, including the three coverage ones', () => {
    const gate = evaluateShipGate({
      coverage: goodCoverage,
      phase1: S(60, 0.20, 1.5),
      phase2: S(40, 0.25, 1.5),
    });
    assert.equal(gate.verdict, 'PASS');
    for (const key of [
      'beatExpectancy', 'beatPF', 'sampleFloorMet', 'noCollapse',
      'accdistCoverageMet', 'flowCoverageMet', 'unscoredCapMet',
    ] as const) {
      assert.equal(gate.conditions[key], true, `${key} must hold for PASS`);
    }
  });

  it('fails on expectancy alone', () => {
    const gate = evaluateShipGate({
      coverage: goodCoverage,
      phase1: S(60, 0.30, 1.5),
      phase2: S(40, 0.25, 1.5),
    });
    assert.equal(gate.verdict, 'FAIL');
    assert.equal(gate.conditions.beatExpectancy, false);
  });

  it('fails when accdistUnknownRate exceeds 0.10', () => {
    const gate = evaluateShipGate({
      coverage: { ...goodCoverage, accdistUnknownRate: 0.11 },
      phase1: S(60, 0.2, 1.5),
      phase2: S(40, 0.25, 1.5),
    });
    assert.equal(gate.verdict, 'FAIL');
    assert.equal(gate.conditions.accdistCoverageMet, false);
  });

  it('fails when flowCoverageRate is below 0.80', () => {
    const gate = evaluateShipGate({
      coverage: { ...goodCoverage, flowCoverageRate: 0.79 },
      phase1: S(60, 0.2, 1.5),
      phase2: S(40, 0.25, 1.5),
    });
    assert.equal(gate.verdict, 'FAIL');
    assert.equal(gate.conditions.flowCoverageMet, false);
  });

  it('fails when unscoredShare exceeds 0.25', () => {
    const gate = evaluateShipGate({
      coverage: { ...goodCoverage, unscoredShare: 0.26 },
      phase1: S(60, 0.2, 1.5),
      phase2: S(40, 0.25, 1.5),
    });
    assert.equal(gate.verdict, 'FAIL');
    assert.equal(gate.conditions.unscoredCapMet, false);
  });

  it('the no-collapse guard is a RATIO, so a collapsed sample cannot pass', () => {
    // phase1=100 ENTERs, phase2=40. Floor (3) is met (40 >= 30), floor (4) is
    // NOT (40 < 0.60 * 100 = 60). System (2) has enough signal for (4) to be
    // meaningful, so this is a MEASURED collapse -> FAIL, not "unreachable".
    const gate = evaluateShipGate({
      coverage: goodCoverage,
      phase1: S(100, 0.20, 1.5),
      phase2: S(40, 0.90, 3.0),
    });
    assert.equal(gate.verdict, 'FAIL', 'a collapse must not hide behind the sample-size excuse');
    assert.equal(gate.conditions.noCollapse, false, '40 < 0.60 * 100');
    assert.equal(gate.conditions.sampleFloorMet, true, 'the floor itself was met');
    assert.equal(gate.conditions.beatExpectancy, true, 'the expectancy win was real but the sample collapsed');
  });

  it('a collapse measured while system (2) is ALSO too small is UNREACHABLE, not FAIL', () => {
    // p1=20 (< the 50-ENTER threshold), p2=5. Floor (3) is not met AND floor
    // (4) is not met, but system (2) has too few ENTERs for (4) to mean
    // anything yet — so this is "too early", not "the gate filtered too hard".
    const gate = evaluateShipGate({
      coverage: goodCoverage,
      phase1: S(20, 0.20, 1.5),
      phase2: S(5, 0.90, 3.0),
    });
    assert.equal(gate.verdict, 'VERDICT_UNREACHABLE');
    assert.equal(gate.sampleFeasible, false);
  });

  it('a null expectancy on either side is FAIL, never a comparison against 0', () => {
    // A null expectancy with a REAL measured sample (both sides over the
    // floors) must be a FAIL. Comparing against 0 would let a system with no
    // scored trades "beat" a real one.
    const gate = evaluateShipGate({
      coverage: goodCoverage,
      phase1: { ...S(60, 0.20, 1.5), expectancyR: null, profitFactor: null },
      phase2: S(40, 0.25, 1.5),
    });
    assert.equal(gate.verdict, 'FAIL');
    assert.equal(gate.conditions.beatExpectancy, false);
    assert.equal(gate.conditions.beatPF, false);
  });
});
