import { query } from '../lib/db';

export interface MtfGateInput {
  sampleCount: number;
  perfectAlignmentWinRate: number;
  perfectAlignmentProfitFactor: number;
  perfectAlignmentExpectancy: number;
  baselineExpectancy: number;
}

export interface MtfGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: MtfGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for Multi-Timeframe Alignment & Institutional Trend Matrix.
 * Enforces the non-negotiable repository invariant: sample size floor must be >= 30
 * out-of-sample trades before a verdict can be rendered (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateMtfGate(input: MtfGateInput): MtfGateVerdict {
  const {
    sampleCount,
    perfectAlignmentWinRate,
    perfectAlignmentProfitFactor,
    perfectAlignmentExpectancy,
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
    perfectAlignmentExpectancy > baselineExpectancy &&
    perfectAlignmentProfitFactor >= 1.30 &&
    perfectAlignmentWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'MTF_TRIPLE_SCREEN_ALIGNMENT_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_MTF_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Multi-Timeframe Alignment & Trend Matrix Walk-Forward Evaluator ===');
  console.log('Reading historical Multi-Timeframe snapshots and trade execution outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM multi_timeframe_matrix_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateMtfGate({
    sampleCount,
    perfectAlignmentWinRate: 0,
    perfectAlignmentProfitFactor: 0,
    perfectAlignmentExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${sampleCount} (requires >= 30)`);
}

if (process.argv[1]?.includes('run-mtf-walkforward')) {
  main().catch((err) => {
    console.error('Fatal walk-forward error:', err);
    process.exit(1);
  });
}
