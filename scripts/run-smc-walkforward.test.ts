import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSmcGate } from './run-smc-walkforward';

test('evaluateSmcGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const result = evaluateSmcGate({
    sampleCount: 15,
    obDefenseWinRate: 0.65,
    obDefenseProfitFactor: 1.80,
    obDefenseExpectancy: 0.38,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(result.details.sampleCount, 15);
});

test('evaluateSmcGate passes when sample size >= 30 and statistical hurdles are met', () => {
  const result = evaluateSmcGate({
    sampleCount: 35,
    obDefenseWinRate: 0.58,
    obDefenseProfitFactor: 1.62,
    obDefenseExpectancy: 0.35,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'PASS');
  assert.equal(result.reason, 'SMC_ORDER_BLOCK_DEFENSE_STATISTICALLY_VERIFIED');
});

test('evaluateSmcGate fails when statistical hurdles are not met despite adequate sample size', () => {
  const result = evaluateSmcGate({
    sampleCount: 42,
    obDefenseWinRate: 0.46, // < 52%
    obDefenseProfitFactor: 1.15, // < 1.30
    obDefenseExpectancy: 0.08,
    baselineExpectancy: 0.14, // below baseline
  });

  assert.equal(result.gateStatus, 'FAIL');
  assert.equal(result.reason, 'INSUFFICIENT_SMC_EDGE');
});
