import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVolumeProfileGate } from './run-volume-profile-walkforward';

test('evaluateVolumeProfileGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const verdict = evaluateVolumeProfileGate({
    sampleCount: 22,
    winRate: 0.60,
    profitFactor: 1.9,
    expectancy: 1.2,
    pocSupportWinRate: 0.65,
  });

  assert.equal(verdict.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(verdict.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(verdict.details.sampleCount, 22);
});

test('evaluateVolumeProfileGate returns PASS when sample size >= 30 and metrics beat thresholds', () => {
  const verdict = evaluateVolumeProfileGate({
    sampleCount: 38,
    winRate: 0.52,
    profitFactor: 1.6,
    expectancy: 0.75,
    pocSupportWinRate: 0.58,
  });

  assert.equal(verdict.gateStatus, 'PASS');
  assert.equal(verdict.reason, 'LIQUIDITY_SHELF_EDGE_VERIFIED');
});

test('evaluateVolumeProfileGate returns FAIL when sample size >= 30 but edge is insufficient', () => {
  const verdict = evaluateVolumeProfileGate({
    sampleCount: 45,
    winRate: 0.38,
    profitFactor: 0.85,
    expectancy: -0.15,
    pocSupportWinRate: 0.40,
  });

  assert.equal(verdict.gateStatus, 'FAIL');
  assert.equal(verdict.reason, 'INSUFFICIENT_LIQUIDITY_EDGE');
});
