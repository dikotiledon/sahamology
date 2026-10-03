import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSectorRotationGate } from './run-sector-rotation-walkforward';

test('evaluateSectorRotationGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const verdict = evaluateSectorRotationGate({
    sampleCount: 19,
    tailwindWinRate: 0.65,
    tailwindProfitFactor: 2.1,
    tailwindExpectancy: 1.5,
    headwindExpectancy: -0.4,
  });

  assert.equal(verdict.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(verdict.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(verdict.details.sampleCount, 19);
});

test('evaluateSectorRotationGate returns PASS when sample size >= 30 and metrics beat thresholds', () => {
  const verdict = evaluateSectorRotationGate({
    sampleCount: 36,
    tailwindWinRate: 0.58,
    tailwindProfitFactor: 1.75,
    tailwindExpectancy: 0.95,
    headwindExpectancy: -0.2,
  });

  assert.equal(verdict.gateStatus, 'PASS');
  assert.equal(verdict.reason, 'SECTOR_ROTATION_EDGE_STATISTICALLY_VERIFIED');
});

test('evaluateSectorRotationGate returns FAIL when sample size >= 30 but edge is insufficient', () => {
  const verdict = evaluateSectorRotationGate({
    sampleCount: 40,
    tailwindWinRate: 0.42,
    tailwindProfitFactor: 0.95,
    tailwindExpectancy: -0.1,
    headwindExpectancy: 0.1,
  });

  assert.equal(verdict.gateStatus, 'FAIL');
  assert.equal(verdict.reason, 'INSUFFICIENT_SECTOR_ROTATION_EDGE');
});
