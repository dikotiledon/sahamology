/**
 * The Phase 3 ship gate, and proof that adding it changed nothing about Phase 2.
 *
 * Two things are being tested here and they are not equally important. The
 * Phase 3 conditions themselves are the visible deliverable. The Phase 2
 * byte-identity is the load-bearing one: `evaluateShipGate` already produced a
 * shipped verdict, and the entire D13 decision was to extend additively rather
 * than by threading a new parameter through it. If Phase 2's output moved even
 * slightly, the report an operator already read would silently change meaning.
 *
 * No Postgres: the gate is a pure function of two scores and two coverage
 * summaries, so every condition is reachable by construction.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateShipGate,
  evaluatePhase3ShipGate,
  computeMicroCoverage,
  scoreSystem,
  SAMPLE_FEASIBILITY,
  COVERAGE_BOUNDS,
  FUNDAMENTAL_BOUNDS,
  PHASE3_SAMPLE_FEASIBILITY,
  type CoverageSummary,
  type SystemScore,
} from './walk-forward-p2';

// --- fixtures ---------------------------------------------------------------

const goodCoverage: CoverageSummary = {
  denominator: 100,
  accdistUnknownRate: 0.02,
  flowCoverageRate: 0.95,
  unscoredShare: 0.05,
};

const goodFundamentals = {
  fundamentalsScoredRate: 0.98,
  fundamentalsIncompleteRate: 0.02,
};

function score(enterN: number, expectancyR: number | null, profitFactor: number | null): SystemScore {
  return { enterN, scoredN: enterN, expectancyR, profitFactor, winRate: 0.5, maxDrawdownR: null };
}

/** A Phase 3 run that clears every condition. */
const passingArgs = {
  coverage: goodCoverage,
  fundamentalCoverage: goodFundamentals,
  phase2: score(60, 0.2, 1.4),
  phase3: score(45, 0.35, 1.6),
  vetoed: 1,
};

// --- Phase 2 must be untouched ---------------------------------------------

test('D13: the Phase 2 ship conditions are exactly the original seven', () => {
  // Named explicitly rather than counted. A new key appearing here means a
  // Phase 3 concept leaked into the report Phase 2 already publishes.
  const result = evaluateShipGate({
    coverage: goodCoverage,
    phase1: score(60, 0.2, 1.4),
    phase2: score(45, 0.35, 1.6),
  });
  assert.deepEqual(
    Object.keys(result.conditions).sort(),
    [
      'accdistCoverageMet',
      'beatExpectancy',
      'beatPF',
      'flowCoverageMet',
      'noCollapse',
      'sampleFloorMet',
      'unscoredCapMet',
    ],
  );
  assert.deepEqual(Object.keys(result).sort(), [
    'conditions',
    'oosEnterPhase1',
    'oosEnterPhase2',
    'reasons',
    'sampleFeasible',
    'verdict',
  ]);
});

test('D13: the Phase 2 feasibility constants are unchanged', () => {
  assert.equal(SAMPLE_FEASIBILITY.minOosEnterPhase2, 30);
  assert.equal(SAMPLE_FEASIBILITY.minOosEnterPhase1, 50);
  assert.equal(SAMPLE_FEASIBILITY.noCollapseRatio, 0.6);
  assert.equal(COVERAGE_BOUNDS.maxAccdistUnknownRate, 0.1);
  assert.equal(COVERAGE_BOUNDS.minFlowCoverageRate, 0.8);
  assert.equal(COVERAGE_BOUNDS.maxUnscoredShare, 0.25);
});

test('D13: a passing Phase 2 run still passes, and a failing one still fails', () => {
  const pass = evaluateShipGate({
    coverage: goodCoverage,
    phase1: score(60, 0.2, 1.4),
    phase2: score(45, 0.35, 1.6),
  });
  assert.equal(pass.verdict, 'PASS');

  const fail = evaluateShipGate({
    coverage: goodCoverage,
    phase1: score(60, 0.2, 1.4),
    phase2: score(45, 0.1, 1.1),
  });
  assert.equal(fail.verdict, 'FAIL');
  assert.equal(fail.conditions.beatExpectancy, false);
});

test('D13: adding the Phase 3 gate did not change an early-sample Phase 2 verdict', () => {
  // The verdict Phase 2 gives today for the current, still-empty sample must
  // not be something Phase 3 quietly upgraded.
  const early = evaluateShipGate({
    coverage: goodCoverage,
    phase1: score(3, 0.1, 1.1),
    phase2: score(2, 0.1, 1.1),
  });
  assert.equal(early.verdict, 'VERDICT_UNREACHABLE');
  assert.equal(early.sampleFeasible, false);
});

// --- Phase 3 conditions -----------------------------------------------------

test('a run clearing every condition is a PASS', () => {
  const result = evaluatePhase3ShipGate(passingArgs);
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.sampleFeasible, true);
  assert.deepEqual(result.reasons, []);
  assert.equal(Object.values(result.conditions).every(Boolean), true);
});

test('the gate has exactly eight conditions', () => {
  const result = evaluatePhase3ShipGate(passingArgs);
  assert.equal(Object.keys(result.conditions).length, 8);
  assert.deepEqual(Object.keys(result.conditions).sort(), [
    'beatExpectancy',
    'beatPF',
    'fundamentalsCoverageMet',
    'incompleteCapMet',
    'noCollapse',
    'sampleFloorMet',
    'unscoredCapMet',
    'vetoPlausibilityMet',
  ]);
});

test('condition 1: Phase 3 must beat Phase 2 expectancy', () => {
  const lower = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(45, 0.1, 1.6) });
  assert.equal(lower.conditions.beatExpectancy, false);
  assert.equal(lower.verdict, 'FAIL');
  // Equality is not a beat: the gate is "did it improve", not "did it tie".
  const equal = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(45, 0.2, 1.6) });
  assert.equal(equal.conditions.beatExpectancy, false);
});

test('condition 2: profit factor may tie but not degrade', () => {
  const tied = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(45, 0.35, 1.4) });
  assert.equal(tied.conditions.beatPF, true);
  const lower = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(45, 0.35, 1.39) });
  assert.equal(lower.conditions.beatPF, false);
});

test('condition 3: the 30-ENTER floor on Phase 3', () => {
  const under = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(29, 0.35, 1.6) });
  assert.equal(under.conditions.sampleFloorMet, false);
  assert.equal(under.sampleFeasible, false);
  // Under the floor the verdict must be UNREACHABLE, never FAIL: the sample is
  // too small to judge, which is a different statement from a measured failure.
  assert.equal(under.verdict, 'VERDICT_UNREACHABLE');
});

test('condition 4: a collapsing sample is a measured FAIL once both floors are met', () => {
  // 40 >= 0.60 * 100 is false while 40 still clears the 30-ENTER floor, and the
  // Phase 2 baseline has 100 ENTERs. Both floors are satisfiable, so this must
  // read FAIL — letting a collapsing gate hide behind the sample-size excuse is
  // the exact failure D17 was written to prevent.
  const collapsed = evaluatePhase3ShipGate({
    ...passingArgs,
    phase2: score(100, 0.2, 1.4),
    phase3: score(40, 0.35, 1.6),
  });
  assert.equal(collapsed.conditions.sampleFloorMet, true);
  assert.equal(collapsed.sampleFeasible, true);
  assert.equal(collapsed.conditions.noCollapse, false);
  assert.equal(collapsed.verdict, 'FAIL');
  assert.ok(collapsed.reasons.some((r) => r.includes('sample collapse')));
});

test('a collapse below the 30-ENTER floor is still UNREACHABLE, not FAIL', () => {
  // The companion to the test above, and the reason the first version of it
  // failed: 20 ENTERs fails the floor, so the gate cannot yet tell a collapse
  // from a sample that has not grown. Reporting FAIL there would condemn a
  // gate on 20 trades — including a gate that is behaving perfectly.
  const tooSmallToJudge = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(20, 0.35, 1.6) });
  assert.equal(tooSmallToJudge.conditions.sampleFloorMet, false);
  assert.equal(tooSmallToJudge.conditions.noCollapse, false);
  assert.equal(tooSmallToJudge.verdict, 'VERDICT_UNREACHABLE');
});

test('the 0.60 boundary is inclusive', () => {
  const exactly = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(36, 0.35, 1.6) });
  assert.equal(exactly.conditions.noCollapse, true);
  const just_under = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(35, 0.35, 1.6) });
  assert.equal(just_under.conditions.noCollapse, false);
});

test('condition 5: a low scoring rate means the treatment was not applied to most of E', () => {
  // "Phase 3 beat Phase 2" is not a real claim if the reading was missing for
  // most signals — that would mean the comparison dropped the hard rows.
  const thin = evaluatePhase3ShipGate({
    ...passingArgs,
    fundamentalCoverage: { ...goodFundamentals, fundamentalsScoredRate: 0.5 },
  });
  assert.equal(thin.conditions.fundamentalsCoverageMet, false);
  assert.equal(thin.verdict, 'FAIL');
});

test('condition 6: degraded captures are capped', () => {
  const degraded = evaluatePhase3ShipGate({
    ...passingArgs,
    fundamentalCoverage: { ...goodFundamentals, fundamentalsIncompleteRate: 0.4 },
  });
  assert.equal(degraded.conditions.incompleteCapMet, false);
});

test('condition 7: an implausible veto rate fails the run', () => {
  // A veto that fires on most signals is a broken rubric, not a working gate.
  const mass_veto = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(45, 0.35, 1.6), vetoed: 40 });
  assert.equal(mass_veto.conditions.vetoPlausibilityMet, false);
  assert.ok(mass_veto.reasons.some((r) => r.includes('vetoRate')));
});

test('condition 8: the micro unscored cap still applies to Phase 3', () => {
  const unscored = evaluatePhase3ShipGate({
    ...passingArgs,
    coverage: { ...goodCoverage, unscoredShare: 0.5 },
  });
  assert.equal(unscored.conditions.unscoredCapMet, false);
});

// --- the honest-verdict behaviour ------------------------------------------

test('an early sample is UNREACHABLE even when every other condition passes', () => {
  const early = evaluatePhase3ShipGate({ ...passingArgs, phase2: score(60, 0.2, 1.4), phase3: score(5, 0.9, 3.0) });
  assert.equal(early.sampleFeasible, false);
  assert.equal(early.verdict, 'VERDICT_UNREACHABLE');
});

test('an early sample is UNREACHABLE even when conditions FAIL', () => {
  // The asymmetry that matters: below the floor, a bad result is still
  // "not yet judgeable", not FAIL. Otherwise noise in a 5-trade sample would
  // produce a FAIL that reads like a refutation.
  const early = evaluatePhase3ShipGate({ ...passingArgs, phase2: score(60, 0.2, 1.4), phase3: score(5, 0.01, 0.5) });
  assert.equal(early.conditions.beatExpectancy, false);
  assert.equal(early.verdict, 'VERDICT_UNREACHABLE');
});

test('a thin Phase 2 baseline is UNREACHABLE, because the ratio has no denominator', () => {
  // The 0.60 guard is measured against Phase 2. With 10 Phase 2 ENTERs the ratio
  // is satisfiable trivially, so reporting PASS would let a collapsed Phase 3
  // pass against a sample too small to compare.
  const thinBaseline = evaluatePhase3ShipGate({ ...passingArgs, phase2: score(10, 0.2, 1.4) });
  assert.equal(thinBaseline.sampleFeasible, false);
  assert.equal(thinBaseline.verdict, 'VERDICT_UNREACHABLE');
  assert.equal(PHASE3_SAMPLE_FEASIBILITY.minOosEnterPhase2Baseline, 50);
});

test('a null expectancy never counts as a beat', () => {
  // null means "nothing was scored", not "zero". Treating it as a win would let
  // a system that produced no measurable trades outscore one that did.
  const noScore = evaluatePhase3ShipGate({ ...passingArgs, phase3: score(45, null, null) });
  assert.equal(noScore.conditions.beatExpectancy, false);
  assert.equal(noScore.conditions.beatPF, false);
});

test('every failing condition is named in reasons', () => {
  const allBad = evaluatePhase3ShipGate({
    coverage: { denominator: 100, accdistUnknownRate: 0.9, flowCoverageRate: 0.1, unscoredShare: 0.9 },
    fundamentalCoverage: { fundamentalsScoredRate: 0.1, fundamentalsIncompleteRate: 0.9 },
    phase2: score(60, 0.5, 2.0),
    phase3: score(40, 0.1, 0.5),
    vetoed: 30,
  });
  assert.equal(allBad.verdict, 'FAIL');
  const joined = allBad.reasons.join(' | ');
  for (const fragment of [
    'expectancy(3)',
    'PF(3)',
    'fundamentalsScoredRate',
    'fundamentalsIncompleteRate',
    'vetoRate',
    'unscoredShare',
  ]) {
    assert.ok(joined.includes(fragment), `reasons do not mention ${fragment}: ${joined}`);
  }
});

test('an empty sample does not produce NaN', () => {
  const empty = evaluatePhase3ShipGate({
    coverage: { denominator: 0, accdistUnknownRate: 0, flowCoverageRate: 0, unscoredShare: 0 },
    fundamentalCoverage: { fundamentalsScoredRate: 0, fundamentalsIncompleteRate: 0 },
    phase2: score(0, null, null),
    phase3: score(0, null, null),
    vetoed: 0,
  });
  assert.equal(empty.verdict, 'VERDICT_UNREACHABLE');
  for (const reason of empty.reasons) {
    assert.equal(reason.includes('NaN'), false, `reason contains NaN: ${reason}`);
  }
});

test('profit factor is gross profit over gross loss, and says so', () => {
  // Found while writing the test above: `scoreSystem` divided NET by gross
  // loss. That variant equals 1 + expectancy/grossLoss, which is bounded below
  // by 1 for any profitable system, reads 0 for a breakeven one, and ranks one
  // 10R win plus one 1R loss BELOW nine 1R wins plus one 1R loss — inverting
  // the comparison the ship gate makes when it requires PF(3) >= PF(2).
  const breakeven = scoreSystem([1, -1]);
  assert.equal(breakeven.profitFactor, 1, 'a breakeven system has PF 1.0, not 0');

  const oneBigWin = scoreSystem([10, -1]);
  const manySmallWins = scoreSystem([1, 1, 1, 1, 1, 1, 1, 1, 1, -1]);
  assert.equal(oneBigWin.profitFactor, 10);
  assert.equal(manySmallWins.profitFactor, 9);
  assert.ok(
    oneBigWin.profitFactor! > manySmallWins.profitFactor!,
    'a single large win must outrank many small ones at equal net',
  );

  // No losses at all is undefined, not infinite.
  assert.equal(scoreSystem([1, 2, 3]).profitFactor, null);
});

test('the gate scores from real scoreSystem output, not hand-made objects', () => {
  // Guards the fixtures themselves: if `scoreSystem` changed shape, these tests
  // would keep passing on objects that no longer match reality.
  const baseline = scoreSystem([0.5, -0.25, 1, -0.5, 0.75], 5);
  assert.equal(baseline.enterN, 5);
  assert.equal(baseline.scoredN, 5);
  assert.equal(baseline.expectancyR, 0.3);
  assert.equal(baseline.profitFactor, 2.25 / 0.75);

  // Both series contain losers, so profit factor is a real ratio rather than a
  // no-loss artefact — an earlier version of this fixture had none, and
  // scoreSystem correctly returned PF 14 for it.
  const phase2 = scoreSystem([0.4, -0.2, 0.6, -0.5, 0.3, 0.1, -0.3, 0.4, 0.3, -0.1], 50);
  const phase3 = scoreSystem([0.9, 0.8, -0.7, 0.6, 0.5, -0.4, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4], 40);

  const result = evaluatePhase3ShipGate({ ...passingArgs, phase2, phase3 });
  assert.equal(result.oosEnterPhase2, 50);
  assert.equal(result.oosEnterPhase3, 40);
  // And the gate's own verdicts follow from those real numbers.
  assert.equal(result.conditions.beatExpectancy, phase3.expectancyR! > phase2.expectancyR!);
  assert.equal(result.conditions.beatPF, phase3.profitFactor! >= phase2.profitFactor!);
});

test('computeMicroCoverage over an empty denominator yields zeros, not NaN', () => {
  const coverage = computeMicroCoverage([]);
  assert.deepEqual(coverage, {
    denominator: 0,
    accdistUnknownRate: 0,
    flowCoverageRate: 0,
    unscoredShare: 0,
  });
});

test('the fundamental bounds are the ones the docs state', () => {
  assert.equal(FUNDAMENTAL_BOUNDS.maxVetoRate, 0.1);
  assert.equal(FUNDAMENTAL_BOUNDS.minFundamentalsScoredRate, 0.9);
  assert.equal(FUNDAMENTAL_BOUNDS.maxFundamentalsIncompleteRate, 0.25);
  assert.equal(PHASE3_SAMPLE_FEASIBILITY.minOosEnterPhase3, 30);
  assert.equal(PHASE3_SAMPLE_FEASIBILITY.noCollapseRatio, 0.6);
});
