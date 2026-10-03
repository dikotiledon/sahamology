import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVcpGate } from './run-vcp-walkforward';

test('evaluateVcpGate returns VERDICT_UNREACHABLE when sample size < 30', () => {
  const verdict = evaluateVcpGate({
    sampleCount: 15,
    vcpPivotWinRate: 0.65,
    vcpProfitFactor: 2.1,
    vcpExpectancy: 1.4,
    baselineExpectancy: 0.2,
  });

  assert.equal(verdict.gateStatus, 'VERDICT_UNREACHABLE');
  assert.equal(verdict.reason, 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE');
  assert.equal(verdict.details.sampleCount, 15);
});

test('evaluateVcpGate returns PASS when sample size >= 30 and metrics beat thresholds', () => {
  const verdict = evaluateVcpGate({
    sampleCount: 35,
    vcpPivotWinRate: 0.58,
    vcpProfitFactor: 1.65,
    vcpExpectancy: 0.85,
    baselineExpectancy: 0.15,
  });

  assert.equal(verdict.gateStatus, 'PASS');
  assert.equal(verdict.reason, 'VCP_SEPA_EDGE_STATISTICALLY_VERIFIED');
});

test('evaluateVcpGate returns FAIL when sample size >= 30 but edge is insufficient', () => {
  const verdict = evaluateVcpGate({
    sampleCount: 42,
    vcpPivotWinRate: 0.44,
    vcpProfitFactor: 0.98,
    vcpExpectancy: -0.05,
    baselineExpectancy: 0.1,
  });

  assert.equal(verdict.gateStatus, 'FAIL');
  assert.equal(verdict.reason, 'INSUFFICIENT_VCP_EDGE');
});
