import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCognitiveDisciplineGate } from './run-cognitive-discipline-walkforward';

test('evaluateCognitiveDisciplineGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const verdict = evaluateCognitiveDisciplineGate({
    sampleCount: 18,
    disciplinedTradePct: 0.85,
    disciplinedExpectancy: 1.4,
    undisciplinedExpectancy: -0.5,
    disciplinedProfitFactor: 2.1,
    undisciplinedProfitFactor: 0.6,
  });

  assert.equal(verdict.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(verdict.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(verdict.details.sampleCount, 18);
});

test('evaluateCognitiveDisciplineGate returns PASS when sample size >= 30 and metrics beat thresholds', () => {
  const verdict = evaluateCognitiveDisciplineGate({
    sampleCount: 35,
    disciplinedTradePct: 0.75,
    disciplinedExpectancy: 0.95,
    undisciplinedExpectancy: -0.25,
    disciplinedProfitFactor: 1.85,
    undisciplinedProfitFactor: 0.7,
  });

  assert.equal(verdict.gateStatus, 'PASS');
  assert.equal(verdict.reason, 'DISCIPLINE_EDGE_STATISTICALLY_VERIFIED');
});

test('evaluateCognitiveDisciplineGate returns FAIL when sample size >= 30 but edge is insufficient', () => {
  const verdict = evaluateCognitiveDisciplineGate({
    sampleCount: 42,
    disciplinedTradePct: 0.40,
    disciplinedExpectancy: -0.1,
    undisciplinedExpectancy: 0.1,
    disciplinedProfitFactor: 0.9,
    undisciplinedProfitFactor: 1.1,
  });

  assert.equal(verdict.gateStatus, 'FAIL');
  assert.equal(verdict.reason, 'INSUFFICIENT_DISCIPLINE_EDGE');
});
