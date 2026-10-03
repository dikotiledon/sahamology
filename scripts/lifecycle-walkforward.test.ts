import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLifecycleGate } from './run-lifecycle-walkforward';

test('evaluateLifecycleGate returns VERDICT_UNREACHABLE when sample is below 30 trades', () => {
  const result = evaluateLifecycleGate({
    sampleCount: 12,
    expectancy: 0.15,
    profitFactor: 1.5,
  });
  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
});

test('evaluateLifecycleGate returns PASS when sample has >= 30 trades and beats baseline', () => {
  const result = evaluateLifecycleGate({
    sampleCount: 35,
    expectancy: 0.22,
    profitFactor: 1.45,
  });
  assert.equal(result.gateStatus, 'PASS');
});

test('evaluateLifecycleGate returns FAIL when sample has >= 30 trades but negative expectancy', () => {
  const result = evaluateLifecycleGate({
    sampleCount: 35,
    expectancy: -0.05,
    profitFactor: 0.85,
  });
  assert.equal(result.gateStatus, 'FAIL');
});
