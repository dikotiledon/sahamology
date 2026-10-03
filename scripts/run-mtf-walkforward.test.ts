import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMtfGate } from './run-mtf-walkforward';

test('evaluateMtfGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const result = evaluateMtfGate({
    sampleCount: 16,
    perfectAlignmentWinRate: 0.65,
    perfectAlignmentProfitFactor: 1.90,
    perfectAlignmentExpectancy: 0.42,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(result.details.sampleCount, 16);
});

test('evaluateMtfGate passes when sample size >= 30 and statistical hurdles are met', () => {
  const result = evaluateMtfGate({
    sampleCount: 36,
    perfectAlignmentWinRate: 0.58,
    perfectAlignmentProfitFactor: 1.65,
    perfectAlignmentExpectancy: 0.35,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'PASS');
  assert.equal(result.reason, 'MTF_TRIPLE_SCREEN_ALIGNMENT_STATISTICALLY_VERIFIED');
});

test('evaluateMtfGate fails when statistical hurdles are not met despite adequate sample size', () => {
  const result = evaluateMtfGate({
    sampleCount: 40,
    perfectAlignmentWinRate: 0.45, // < 52%
    perfectAlignmentProfitFactor: 1.12, // < 1.30
    perfectAlignmentExpectancy: 0.08,
    baselineExpectancy: 0.14, // below baseline
  });

  assert.equal(result.gateStatus, 'FAIL');
  assert.equal(result.reason, 'INSUFFICIENT_MTF_EDGE');
});
