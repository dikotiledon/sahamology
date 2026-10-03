import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWyckoffGate } from './run-wyckoff-walkforward';

test('evaluateWyckoffGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const verdict = evaluateWyckoffGate({
    sampleCount: 15,
    winRate: 0.65,
    profitFactor: 2.1,
    expectancy: 1.5,
  });

  assert.equal(verdict.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(verdict.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(verdict.details.sampleCount, 15);
});

test('evaluateWyckoffGate returns PASS when sample size >= 30 and metrics beat thresholds', () => {
  const verdict = evaluateWyckoffGate({
    sampleCount: 35,
    winRate: 0.55,
    profitFactor: 1.8,
    expectancy: 0.85,
  });

  assert.equal(verdict.gateStatus, 'PASS');
  assert.equal(verdict.reason, 'STRUCTURAL_CONFLUENCE_VERIFIED');
});

test('evaluateWyckoffGate returns FAIL when sample size >= 30 but edge is insufficient', () => {
  const verdict = evaluateWyckoffGate({
    sampleCount: 40,
    winRate: 0.35,
    profitFactor: 0.9,
    expectancy: -0.2,
  });

  assert.equal(verdict.gateStatus, 'FAIL');
  assert.equal(verdict.reason, 'INSUFFICIENT_EDGE');
});
