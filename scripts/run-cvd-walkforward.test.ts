import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCvdGate } from './run-cvd-walkforward';

test('evaluateCvdGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const result = evaluateCvdGate({
    sampleCount: 18,
    cvdAbsorptionWinRate: 0.62,
    cvdAbsorptionProfitFactor: 1.85,
    cvdAbsorptionExpectancy: 0.40,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(result.details.sampleCount, 18);
});

test('evaluateCvdGate passes when sample size >= 30 and statistical hurdles are met', () => {
  const result = evaluateCvdGate({
    sampleCount: 35,
    cvdAbsorptionWinRate: 0.58,
    cvdAbsorptionProfitFactor: 1.62,
    cvdAbsorptionExpectancy: 0.35,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'PASS');
  assert.equal(result.reason, 'CVD_ABSORPTION_STATISTICALLY_VERIFIED');
});

test('evaluateCvdGate fails when statistical hurdles are not met despite adequate sample size', () => {
  const result = evaluateCvdGate({
    sampleCount: 40,
    cvdAbsorptionWinRate: 0.45, // < 52%
    cvdAbsorptionProfitFactor: 1.15, // < 1.30
    cvdAbsorptionExpectancy: 0.08,
    baselineExpectancy: 0.15, // below baseline
  });

  assert.equal(result.gateStatus, 'FAIL');
  assert.equal(result.reason, 'INSUFFICIENT_CVD_EDGE');
});
