import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMarketBreadthGate } from './run-market-breadth-walkforward';

test('evaluateMarketBreadthGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const result = evaluateMarketBreadthGate({
    sampleCount: 15,
    expansionWinRate: 0.65,
    expansionProfitFactor: 2.1,
    expansionExpectancy: 0.45,
    baselineExpectancy: 0.15,
  });

  assert.equal(result.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(result.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(result.details.sampleCount, 15);
});

test('evaluateMarketBreadthGate passes when sample size >= 30 and statistical hurdles are met', () => {
  const result = evaluateMarketBreadthGate({
    sampleCount: 42,
    expansionWinRate: 0.58,
    expansionProfitFactor: 1.65,
    expansionExpectancy: 0.35,
    baselineExpectancy: 0.12,
  });

  assert.equal(result.gateStatus, 'PASS');
  assert.equal(result.reason, 'BREADTH_EXPANSION_REGIME_STATISTICALLY_VERIFIED');
});

test('evaluateMarketBreadthGate fails when statistical hurdles are not met despite adequate sample size', () => {
  const result = evaluateMarketBreadthGate({
    sampleCount: 50,
    expansionWinRate: 0.46, // < 52%
    expansionProfitFactor: 1.15, // < 1.30
    expansionExpectancy: 0.08,
    baselineExpectancy: 0.15, // not exceeding baseline
  });

  assert.equal(result.gateStatus, 'FAIL');
  assert.equal(result.reason, 'INSUFFICIENT_BREADTH_EDGE');
});
