import { query } from '../lib/db';

export interface RhiGateInput {
  sampleCount: number;
  stealthAccumulationWinRate: number;
  stealthAccumulationProfitFactor: number;
  stealthAccumulationExpectancy: number;
  baselineExpectancy: number;
}

export interface RhiGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: RhiGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for Retail Herd Index & Syndicate Asymmetry Engine.
 * Enforces the non-negotiable repository invariant: sample size floor must be >= 30
 * out-of-sample trades before a verdict can be rendered (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateRhiGate(input: RhiGateInput): RhiGateVerdict {
  const {
    sampleCount,
    stealthAccumulationWinRate,
    stealthAccumulationProfitFactor,
    stealthAccumulationExpectancy,
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
    stealthAccumulationExpectancy > baselineExpectancy &&
    stealthAccumulationProfitFactor >= 1.30 &&
    stealthAccumulationWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'RETAIL_HERD_ASYMMETRY_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_RHI_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Retail Herd Index & Syndicate Asymmetry Walk-Forward Evaluator ===');
  console.log('Reading historical Retail Herd Index snapshots and trade execution outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM retail_herd_index_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateRhiGate({
    sampleCount,
    stealthAccumulationWinRate: 0,
    stealthAccumulationProfitFactor: 0,
    stealthAccumulationExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${sampleCount} (requires >= 30)`);
}

if (process.argv[1]?.includes('run-rhi-walkforward')) {
  main().catch((err) => {
    console.error('Fatal walk-forward error:', err);
    process.exit(1);
  });
}
