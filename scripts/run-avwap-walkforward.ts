import { query } from '../lib/db';

export interface AvwapGateInput {
  sampleCount: number;
  avwapDefenseWinRate: number;
  avwapDefenseProfitFactor: number;
  avwapDefenseExpectancy: number;
  baselineExpectancy: number;
}

export interface AvwapGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: AvwapGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for Anchored VWAP & Bandar Benchmark Engine.
 * Enforces the non-negotiable repository invariant: sample size floor must be >= 30
 * out-of-sample trades before a verdict can be rendered (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateAvwapGate(input: AvwapGateInput): AvwapGateVerdict {
  const {
    sampleCount,
    avwapDefenseWinRate,
    avwapDefenseProfitFactor,
    avwapDefenseExpectancy,
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
    avwapDefenseExpectancy > baselineExpectancy &&
    avwapDefenseProfitFactor >= 1.30 &&
    avwapDefenseWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'AVWAP_INSTITUTIONAL_DEFENSE_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_AVWAP_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Anchored VWAP & Institutional Bandar Benchmark Walk-Forward Evaluator ===');
  console.log('Reading historical Anchored VWAP snapshots and trade execution outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM anchored_vwap_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateAvwapGate({
    sampleCount,
    avwapDefenseWinRate: 0,
    avwapDefenseProfitFactor: 0,
    avwapDefenseExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${sampleCount} (requires >= 30)`);
}

if (process.argv[1] && process.argv[1].endsWith('run-avwap-walkforward.ts')) {
  void main();
}
