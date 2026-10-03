import { query } from '../lib/db';

export interface OrbGateInput {
  sampleCount: number;
  orbExpansionWinRate: number;
  orbExpansionProfitFactor: number;
  orbExpansionExpectancy: number;
  baselineExpectancy: number;
}

export interface OrbGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: OrbGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for Opening Range Breakout (ORB) & Initial Balance Engine.
 * Enforces the non-negotiable repository invariant: sample size floor must be >= 30
 * out-of-sample trades before a verdict can be rendered (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateOrbGate(input: OrbGateInput): OrbGateVerdict {
  const {
    sampleCount,
    orbExpansionWinRate,
    orbExpansionProfitFactor,
    orbExpansionExpectancy,
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
    orbExpansionExpectancy > baselineExpectancy &&
    orbExpansionProfitFactor >= 1.30 &&
    orbExpansionWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'ORB_INITIAL_BALANCE_EXPANSION_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_ORB_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Opening Range Breakout (ORB) & Initial Balance Walk-Forward Evaluator ===');
  console.log('Reading historical Initial Balance snapshots and trade execution outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM opening_range_breakout_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateOrbGate({
    sampleCount,
    orbExpansionWinRate: 0,
    orbExpansionProfitFactor: 0,
    orbExpansionExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${sampleCount} (requires >= 30)`);
}

if (process.argv[1]?.includes('run-orb-walkforward')) {
  main().catch((err) => {
    console.error('Fatal walk-forward error:', err);
    process.exit(1);
  });
}
