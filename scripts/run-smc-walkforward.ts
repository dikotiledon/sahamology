import { query } from '../lib/db';

export interface SmcGateInput {
  sampleCount: number;
  obDefenseWinRate: number;
  obDefenseProfitFactor: number;
  obDefenseExpectancy: number;
  baselineExpectancy: number;
}

export interface SmcGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: SmcGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for Smart Money Concepts (Order Blocks & FVG Engine).
 * Enforces the non-negotiable repository invariant: sample size floor must be >= 30
 * out-of-sample trades before a verdict can be rendered (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateSmcGate(input: SmcGateInput): SmcGateVerdict {
  const {
    sampleCount,
    obDefenseWinRate,
    obDefenseProfitFactor,
    obDefenseExpectancy,
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
    obDefenseExpectancy > baselineExpectancy &&
    obDefenseProfitFactor >= 1.30 &&
    obDefenseWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'SMC_ORDER_BLOCK_DEFENSE_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_SMC_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Smart Money Concepts (Order Blocks & FVG) Walk-Forward Evaluator ===');
  console.log('Reading historical Smart Money snapshots and trade execution outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM smart_money_structure_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateSmcGate({
    sampleCount,
    obDefenseWinRate: 0,
    obDefenseProfitFactor: 0,
    obDefenseExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${sampleCount} (requires >= 30)`);
}

if (process.argv[1]?.includes('run-smc-walkforward')) {
  main().catch((err) => {
    console.error('Fatal walk-forward error:', err);
    process.exit(1);
  });
}
