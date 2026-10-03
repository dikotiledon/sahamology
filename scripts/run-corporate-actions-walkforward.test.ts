import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCorpActionGate } from './run-corporate-actions-walkforward';

test('evaluateCorpActionGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const result = evaluateCorpActionGate({
    sampleCount: 15,
    preCumRunUpWinRate: 0.65,
    preCumRunUpProfitFactor: 1.85,
    preCumRunUpExpectancy: 0.38,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(result.details.sampleCount, 15);
});

test('evaluateCorpActionGate passes when sample size >= 30 and statistical hurdles are met', () => {
  const result = evaluateCorpActionGate({
    sampleCount: 35,
    preCumRunUpWinRate: 0.58,
    preCumRunUpProfitFactor: 1.62,
    preCumRunUpExpectancy: 0.32,
    baselineExpectancy: 0.14,
  });

  assert.equal(result.gateStatus, 'PASS');
  assert.equal(result.reason, 'CORPORATE_ACTION_RUNUP_STATISTICALLY_VERIFIED');
});

test('evaluateCorpActionGate fails when statistical hurdles are not met despite adequate sample size', () => {
  const result = evaluateCorpActionGate({
    sampleCount: 40,
    preCumRunUpWinRate: 0.46, // < 52%
    preCumRunUpProfitFactor: 1.15, // < 1.30
    preCumRunUpExpectancy: 0.08,
    baselineExpectancy: 0.14, // below baseline
  });

  assert.equal(result.gateStatus, 'FAIL');
  assert.equal(result.reason, 'INSUFFICIENT_CORPORATE_ACTION_EDGE');
});
