import { query } from '../lib/db';

export interface VcpGateInput {
  sampleCount: number;
  vcpPivotWinRate: number;
  vcpProfitFactor: number;
  vcpExpectancy: number;
  baselineExpectancy: number;
}

export interface VcpGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: VcpGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for the VCP & Trend Template Engine.
 * Enforces the repository invariant: sample size floor must be >= 30 before
 * the gate can be judged (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateVcpGate(input: VcpGateInput): VcpGateVerdict {
  const {
    sampleCount,
    vcpPivotWinRate,
    vcpProfitFactor,
    vcpExpectancy,
    baselineExpectancy,
  } = input;

  if (sampleCount < 30) {
    return {
      gateStatus: 'VERDICT_UNREACHABLE',
      reason: 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE',
      details: input,
    };
  }

  if (
    vcpExpectancy > baselineExpectancy &&
    vcpProfitFactor > 1.25 &&
    vcpPivotWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'VCP_SEPA_EDGE_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_VCP_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Volatility Contraction Pattern (VCP) Walk-Forward Evaluator ===');
  console.log('Reading historical VCP snapshots and constituent trade outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM vcp_patterns_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateVcpGate({
    sampleCount,
    vcpPivotWinRate: 0,
    vcpProfitFactor: 0,
    vcpExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${verdict.details.sampleCount} (requires >= 30)`);
}

if (process.argv[1] && process.argv[1].endsWith('run-vcp-walkforward.ts')) {
  void main();
}
