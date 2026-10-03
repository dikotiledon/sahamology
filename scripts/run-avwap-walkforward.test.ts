import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAvwapGate } from './run-avwap-walkforward';

test('evaluateAvwapGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const result = evaluateAvwapGate({
    sampleCount: 18,
    avwapDefenseWinRate: 0.62,
    avwapDefenseProfitFactor: 1.85,
    avwapDefenseExpectancy: 0.40,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(result.details.sampleCount, 18);
});

test('evaluateAvwapGate passes when sample size >= 30 and statistical hurdles are met', () => {
  const result = evaluateAvwapGate({
    sampleCount: 38,
    avwapDefenseWinRate: 0.56,
    avwapDefenseProfitFactor: 1.55,
    avwapDefenseExpectancy: 0.32,
    baselineExpectancy: 0.14,
  });

  assert.equal(result.gateStatus, 'PASS');
  assert.equal(result.reason, 'AVWAP_INSTITUTIONAL_DEFENSE_STATISTICALLY_VERIFIED');
});

test('evaluateAvwapGate fails when statistical hurdles are not met despite adequate sample size', () => {
  const result = evaluateAvwapGate({
    sampleCount: 45,
    avwapDefenseWinRate: 0.48, // < 52%
    avwapDefenseProfitFactor: 1.10, // < 1.30
    avwapDefenseExpectancy: 0.05,
    baselineExpectancy: 0.15, // not exceeding baseline
  });

  assert.equal(result.gateStatus, 'FAIL');
  assert.equal(result.reason, 'INSUFFICIENT_AVWAP_EDGE');
});
