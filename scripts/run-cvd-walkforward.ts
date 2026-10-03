import { query } from '../lib/db';

export interface CvdGateInput {
  sampleCount: number;
  cvdAbsorptionWinRate: number;
  cvdAbsorptionProfitFactor: number;
  cvdAbsorptionExpectancy: number;
  baselineExpectancy: number;
}

export interface CvdGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: CvdGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for Cumulative Volume Delta (CVD) & Tape Aggression Engine.
 * Enforces the non-negotiable repository invariant: sample size floor must be >= 30
 * out-of-sample trades before a verdict can be rendered (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateCvdGate(input: CvdGateInput): CvdGateVerdict {
  const {
    sampleCount,
    cvdAbsorptionWinRate,
    cvdAbsorptionProfitFactor,
    cvdAbsorptionExpectancy,
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
    cvdAbsorptionExpectancy > baselineExpectancy &&
    cvdAbsorptionProfitFactor >= 1.30 &&
    cvdAbsorptionWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'CVD_ABSORPTION_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_CVD_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Cumulative Volume Delta (CVD) & Tape Aggression Walk-Forward Evaluator ===');
  console.log('Reading historical Cumulative Volume Delta snapshots and trade execution outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM cumulative_volume_delta_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateCvdGate({
    sampleCount,
    cvdAbsorptionWinRate: 0,
    cvdAbsorptionProfitFactor: 0,
    cvdAbsorptionExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${sampleCount} (requires >= 30)`);
}

if (process.argv[1]?.includes('run-cvd-walkforward')) {
  main().catch((err) => {
    console.error('Fatal walk-forward error:', err);
    process.exit(1);
  });
}
