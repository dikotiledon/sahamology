import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRhiGate } from './run-rhi-walkforward';

test('evaluateRhiGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const result = evaluateRhiGate({
    sampleCount: 16,
    stealthAccumulationWinRate: 0.62,
    stealthAccumulationProfitFactor: 1.85,
    stealthAccumulationExpectancy: 0.40,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(result.details.sampleCount, 16);
});

test('evaluateRhiGate passes when sample size >= 30 and statistical hurdles are met', () => {
  const result = evaluateRhiGate({
    sampleCount: 36,
    stealthAccumulationWinRate: 0.58,
    stealthAccumulationProfitFactor: 1.65,
    stealthAccumulationExpectancy: 0.35,
    baselineExpectancy: 0.14,
  });

  assert.equal(result.gateStatus, 'PASS');
  assert.equal(result.reason, 'RETAIL_HERD_ASYMMETRY_STATISTICALLY_VERIFIED');
});

test('evaluateRhiGate fails when statistical hurdles are not met despite adequate sample size', () => {
  const result = evaluateRhiGate({
    sampleCount: 42,
    stealthAccumulationWinRate: 0.45, // < 52%
    stealthAccumulationProfitFactor: 1.12, // < 1.30
    stealthAccumulationExpectancy: 0.08,
    baselineExpectancy: 0.14, // below baseline
  });

  assert.equal(result.gateStatus, 'FAIL');
  assert.equal(result.reason, 'INSUFFICIENT_RHI_EDGE');
});
