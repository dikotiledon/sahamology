import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOrbGate } from './run-orb-walkforward';

test('evaluateOrbGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const result = evaluateOrbGate({
    sampleCount: 14,
    orbExpansionWinRate: 0.60,
    orbExpansionProfitFactor: 1.75,
    orbExpansionExpectancy: 0.38,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(result.details.sampleCount, 14);
});

test('evaluateOrbGate passes when sample size >= 30 and statistical hurdles are met', () => {
  const result = evaluateOrbGate({
    sampleCount: 38,
    orbExpansionWinRate: 0.58,
    orbExpansionProfitFactor: 1.60,
    orbExpansionExpectancy: 0.32,
    baselineExpectancy: 0.14,
  });

  assert.equal(result.gateStatus, 'PASS');
  assert.equal(result.reason, 'ORB_INITIAL_BALANCE_EXPANSION_STATISTICALLY_VERIFIED');
});

test('evaluateOrbGate fails when statistical hurdles are not met despite adequate sample size', () => {
  const result = evaluateOrbGate({
    sampleCount: 42,
    orbExpansionWinRate: 0.45, // < 52%
    orbExpansionProfitFactor: 1.10, // < 1.30
    orbExpansionExpectancy: 0.05,
    baselineExpectancy: 0.14, // not exceeding baseline
  });

  assert.equal(result.gateStatus, 'FAIL');
  assert.equal(result.reason, 'INSUFFICIENT_ORB_EDGE');
});
