import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTraderTilt, updatePsychologicalCapital } from './tilt-detector';
import type { TradeDisciplineReview } from './types';

test('evaluateTraderTilt returns NORMAL state when capital is high and zero violations', () => {
  const status = evaluateTraderTilt({
    currentCapitalPct: 100,
    consecutiveViolations: 0,
    recentReviews: [],
  });

  assert.equal(status.tiltState, 'NORMAL');
  assert.equal(status.psychologicalCapitalPct, 100);
  assert.equal(status.consecutiveViolations, 0);
  assert.match(status.advisory, /Optimal psychological state/i);
});

test('evaluateTraderTilt escalates to CAUTION on single deviation or capital dip', () => {
  const status = evaluateTraderTilt({
    currentCapitalPct: 65,
    consecutiveViolations: 1,
    recentReviews: [],
  });

  assert.equal(status.tiltState, 'CAUTION');
  assert.match(status.advisory, /CAUTION/i);
});

test('evaluateTraderTilt escalates to TILT_LOCKOUT on capital < 40% or 3 consecutive violations', () => {
  const statusA = evaluateTraderTilt({
    currentCapitalPct: 35,
    consecutiveViolations: 1,
    recentReviews: [],
  });
  assert.equal(statusA.tiltState, 'TILT_LOCKOUT');
  assert.match(statusA.advisory, /LOCKOUT/i);

  const statusB = evaluateTraderTilt({
    currentCapitalPct: 80,
    consecutiveViolations: 3,
    recentReviews: [],
  });
  assert.equal(statusB.tiltState, 'TILT_LOCKOUT');
});

test('updatePsychologicalCapital increases on clean trade and decreases on violations', () => {
  const cleanReview: TradeDisciplineReview = {
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    disciplineScore: 100,
    grade: 'MASTER_DISCIPLINE',
    deviations: [],
    isDisciplined: true,
    summary: 'Master discipline',
    psychologicalState: 'CALM',
  };

  const updatedCapital = updatePsychologicalCapital(80, cleanReview);
  assert.equal(updatedCapital, 85); // +5 recovery, capped at 100

  const badReview: TradeDisciplineReview = {
    emiten: 'BBCA',
    tradeDate: '2026-10-02',
    disciplineScore: 40,
    grade: 'UNGOVERNED_EXECUTION',
    deviations: [
      {
        type: 'STOP_WIDENED',
        penalty: 35,
        severity: 'SEVERE',
        description: 'Stop widened',
      },
      {
        type: 'FOMO_CHASE',
        penalty: 25,
        severity: 'MODERATE',
        description: 'FOMO entry',
      },
    ],
    isDisciplined: false,
    summary: 'Ungoverned execution',
    psychologicalState: 'FRUSTRATED',
  };

  const diminishedCapital = updatePsychologicalCapital(85, badReview);
  assert.ok(diminishedCapital <= 65);
});
