import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COVERAGE_BOUNDS,
  MACRO_BOUNDS,
  PHASE4_SAMPLE_FEASIBILITY,
  evaluatePhase3ShipGate,
  evaluatePhase4ShipGate,
  scoreSystem,
  type CoverageSummary,
  type MacroCoverage,
  type SystemScore,
} from './walk-forward-p2';

/**
 * Leaf 1.3.3 — the Phase 4 ship gate.
 *
 * Eight conditions, all measured on the OUT-OF-SAMPLE fold, all paired against
 * the Phase 3 arm on identical signals. Two properties dominate the tests
 * below, and both are ways a gate can lie:
 *
 *   1. An UNMEASURABLE sample must read VERDICT_UNREACHABLE, never FAIL.
 *      This is the single most important behaviour in the file. A gate that
 *      reports FAIL on 13 signals is making a claim about code performance
 *      that it has no evidence for, and it trains the operator to ignore FAIL
 *      — which is exactly when a real regression would go unread. The
 *      asymmetry is deliberate and matches Phase 3: once the sample IS large
 *      enough, a no-collapse failure is a REAL measured failure and must read
 *      as FAIL, or a collapsing gate could hide behind the sample-size excuse
 *      indefinitely.
 *
 *   2. UNSCORED is not a neutral pass. A signal with no regime reading must
 *      leave the candidate's denominator, not be scored as "the regime was
 *      fine". Macro state is exactly what selects for adverse days, so
 *      dropping unscored rows biases the candidate arm in the direction that
 *      flatters it.
 */

const coverage = (over: Partial<CoverageSummary> = {}): CoverageSummary => ({
  denominator: 100,
  accdistUnknownRate: 0.02,
  flowCoverageRate: 0.95,
  unscoredShare: 0.05,
  ...over,
});

const macroCoverage = (over: Partial<MacroCoverage> = {}): MacroCoverage => ({
  macroScoredRate: 0.97,
  macroIncompleteRate: 0.03,
  ...over,
});

/** A system that clears every floor, so each test can break exactly one thing. */
const system = (enterN: number, expectancyR: number, profitFactor: number): SystemScore => {
  const r = Array.from({ length: enterN }, () => expectancyR);
  const s = scoreSystem(r, enterN);
  return { ...s, profitFactor };
};

const passing = {
  coverage: coverage(),
  macroCoverage: macroCoverage(),
  phase3: system(80, 0.2, 1.4),
  phase4: system(70, 0.35, 1.6),
  held: 10,
};

describe('the Phase 4 gate is a SEPARATE function from the Phase 3 gate', () => {
  it('a Phase 4 input cannot change the Phase 3 verdict', () => {
    // D13, restated for Phase 4: the shipped Phase 2/3 verdicts must not move
    // because a Phase 4 concept exists. If evaluateShipGate or
    // evaluatePhase3ShipGate took a phase4 argument, this would break.
    const p3Args = {
      coverage: coverage(),
      fundamentalCoverage: { fundamentalsScoredRate: 0.97, fundamentalsIncompleteRate: 0.03 },
      phase2: system(80, 0.2, 1.4),
      phase3: system(70, 0.35, 1.6),
      vetoed: 10,
    };
    const before = JSON.stringify(evaluatePhase3ShipGate(p3Args));
    evaluatePhase4ShipGate(passing);
    const after = JSON.stringify(evaluatePhase3ShipGate(p3Args));
    assert.equal(after, before, 'evaluating Phase 4 moved the Phase 3 verdict');
  });

  it('the Phase 3 result shape is unchanged — no macro keys leaked into it', () => {
    const r = evaluatePhase3ShipGate({
      coverage: coverage(),
      fundamentalCoverage: { fundamentalsScoredRate: 0.97, fundamentalsIncompleteRate: 0.03 },
      phase2: system(80, 0.2, 1.4),
      phase3: system(70, 0.35, 1.6),
      vetoed: 10,
    });
    assert.deepEqual(Object.keys(r).sort(), [
      'conditions',
      'oosEnterPhase2',
      'oosEnterPhase3',
      'reasons',
      'sampleFeasible',
      'verdict',
      'vetoed',
    ]);
    assert.deepEqual(Object.keys(r.conditions).sort(), [
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
});

describe('an unmeasurable sample reads VERDICT_UNREACHABLE, never FAIL', () => {
  it('13 signals — the current live dataset — cannot judge the gate', () => {
    const r = evaluatePhase4ShipGate({
      coverage: coverage({ denominator: 13 }),
      macroCoverage: macroCoverage({ macroScoredRate: 0.4 }),
      phase3: system(6, 0.1, 1.1),
      phase4: system(4, 0.05, 0.9),
      held: 2,
    });
    assert.equal(r.verdict, 'VERDICT_UNREACHABLE');
    assert.equal(r.sampleFeasible, false);
    // The reasons must say WHY, in numbers an operator can act on.
    assert.ok(r.reasons.some((x) => /enterN\(4\)=4 below the 30 floor/.test(x)));
  });

  it('a large baseline with a small candidate arm is unreachable, not FAIL', () => {
    const r = evaluatePhase4ShipGate({ ...passing, phase4: system(10, 0.5, 2.0) });
    assert.equal(r.verdict, 'VERDICT_UNREACHABLE');
    assert.ok(r.reasons.some((x) => /sample collapse/.test(x)));
  });

  it('a large candidate with a small baseline is unreachable — the ratio is meaningless', () => {
    const r = evaluatePhase4ShipGate({ ...passing, phase3: system(20, 0.2, 1.4) });
    assert.equal(r.verdict, 'VERDICT_UNREACHABLE');
  });

  it('a measured loss on a large sample IS a FAIL', () => {
    // The asymmetry that keeps VERDICT_UNREACHABLE from becoming a hiding
    // place: once the sample can judge, losing must read as losing.
    const r = evaluatePhase4ShipGate({ ...passing, phase4: system(70, 0.05, 1.1) });
    assert.equal(r.sampleFeasible, true);
    assert.equal(r.verdict, 'FAIL');
    assert.ok(r.conditions.sampleFloorMet);
    assert.ok(r.conditions.noCollapse);
    assert.equal(r.conditions.beatExpectancy, false);
  });

  it('a collapse on a large sample IS a FAIL, not an excuse', () => {
    // enterN=40 clears the 30-ENTER floor but falls below 0.60 x 80 = 48.
    // Every other condition passes, so the verdict rests on noCollapse alone —
    // which is exactly the case a sample-size excuse would otherwise swallow.
    const r = evaluatePhase4ShipGate({ ...passing, phase4: system(40, 0.5, 2.0) });
    assert.equal(r.sampleFeasible, true, 'a collapse must not excuse itself as a small sample');
    assert.equal(r.verdict, 'FAIL');
    assert.equal(r.conditions.noCollapse, false);
    assert.equal(r.conditions.sampleFloorMet, true);
    const others = Object.entries(r.conditions).filter(([k]) => k !== 'noCollapse');
    assert.ok(others.every(([, v]) => v), `only noCollapse should fail: ${JSON.stringify(r.conditions)}`);
  });
});

describe('all eight conditions are real and individually falsifiable', () => {
  const each = [
    ['beatExpectancy', { phase4: system(70, 0.05, 1.6) }],
    ['beatPF', { phase4: system(70, 0.35, 1.0) }],
    ['macroCoverageMet', { macroCoverage: macroCoverage({ macroScoredRate: 0.5 }) }],
    ['incompleteCapMet', { macroCoverage: macroCoverage({ macroIncompleteRate: 0.9 }) }],
    ['unscoredCapMet', { coverage: coverage({ unscoredShare: 0.9 }) }],
    ['raisePlausibilityMet', { held: 60 }],
  ] as const;

  for (const [condition, override] of each) {
    it(`${condition} can fail on its own`, () => {
      const r = evaluatePhase4ShipGate({ ...passing, ...(override as object) });
      assert.equal(r.sampleFeasible, true, `${condition} should be reachable on a full sample`);
      assert.equal(r.conditions[condition], false, `${condition} did not fail`);
      assert.equal(r.verdict, 'FAIL');
      assert.ok(r.reasons.length > 0, `${condition} failed without a reason`);
    });
  }

  it('sampleFloorMet and noCollapse are floors, not comparisons', () => {
    const small = evaluatePhase4ShipGate({ ...passing, phase4: system(29, 0.35, 1.6) });
    assert.equal(small.conditions.sampleFloorMet, false);
    const collapsed = evaluatePhase4ShipGate({ ...passing, phase4: system(40, 0.35, 1.6) });
    assert.equal(collapsed.conditions.sampleFloorMet, true);
    assert.equal(collapsed.conditions.noCollapse, false);
  });

  it('a full pass needs every condition true', () => {
    const r = evaluatePhase4ShipGate(passing);
    assert.equal(r.verdict, 'PASS');
    assert.ok(Object.values(r.conditions).every(Boolean));
  });
});

describe('the hold rate is a plausibility bound, not a verdict lever', () => {
  it('reports the hold rate over scoredN = enterN + held', () => {
    const r = evaluatePhase4ShipGate({ ...passing, held: 10 });
    assert.equal(r.holdRate, 10 / (70 + 10));
    // scoredN stays private: publishing it would invite a caller to recompute
    // the rate with a different denominator.
    assert.equal('scoredN' in r, false, 'scoredN leaked into the public result');
  });

  it('an implausible hold rate fails the gate but is NOT a sample-feasibility excuse', () => {
    const r = evaluatePhase4ShipGate({ ...passing, held: 60 });
    assert.equal(r.sampleFeasible, true, 'a huge hold rate must not be reported as "unreachable"');
    assert.equal(r.conditions.raisePlausibilityMet, false);
    assert.equal(r.verdict, 'FAIL');
  });

  it('a zero-hold gate is not automatically suspicious', () => {
    const r = evaluatePhase4ShipGate({ ...passing, held: 0 });
    assert.equal(r.conditions.raisePlausibilityMet, true);
  });

  it('the bound is looser than the Phase 3 veto cap, and says why', () => {
    // A contextual overlay may legitimately hold a meaningful share of entries;
    // what it must never do is hold nearly all of them, which is what noCollapse
    // catches. Asserting the relationship keeps the two constants from drifting
    // into a contradiction.
    assert.ok(MACRO_BOUNDS.maxHoldRate > 0.1);
    assert.ok(MACRO_BOUNDS.maxHoldRate < PHASE4_SAMPLE_FEASIBILITY.noCollapseRatio);
  });
});

describe('unscored is not a neutral pass', () => {
  it('a low macro coverage rate fails the gate rather than shrinking the sample silently', () => {
    const r = evaluatePhase4ShipGate({
      ...passing,
      macroCoverage: macroCoverage({ macroScoredRate: 0.4 }),
    });
    assert.equal(r.conditions.macroCoverageMet, false);
    assert.equal(r.verdict, 'FAIL');
    assert.ok(r.reasons.some((x) => /macroScoredRate 0.400 < 0.9/.test(x)));
  });

  it('the coverage bounds are shared with the earlier phases where that makes sense', () => {
    // An unscored cap that drifts between phases would let the denominator move
    // silently as phases are added.
    assert.equal(COVERAGE_BOUNDS.maxUnscoredShare, 0.25);
    assert.equal(MACRO_BOUNDS.maxMacroIncompleteRate, 0.25);
    assert.equal(MACRO_BOUNDS.minMacroScoredRate, 0.9);
  });

  it('the baseline floor is the same 30/0.60 arithmetic as every prior phase', () => {
    assert.equal(PHASE4_SAMPLE_FEASIBILITY.minOosEnterPhase4, 30);
    assert.equal(PHASE4_SAMPLE_FEASIBILITY.minOosEnterPhase3Baseline, 50);
    assert.equal(PHASE4_SAMPLE_FEASIBILITY.noCollapseRatio, 0.6);
  });
});
