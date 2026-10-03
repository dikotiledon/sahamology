import { query } from '../lib/db';

export interface CorpActionGateInput {
  sampleCount: number;
  preCumRunUpWinRate: number;
  preCumRunUpProfitFactor: number;
  preCumRunUpExpectancy: number;
  baselineExpectancy: number;
}

export interface CorpActionGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: CorpActionGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for Corporate Actions & Dividend Arbitrage Engine.
 * Enforces the non-negotiable repository invariant: sample size floor must be >= 30
 * out-of-sample trades before a verdict can be rendered (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateCorpActionGate(input: CorpActionGateInput): CorpActionGateVerdict {
  const {
    sampleCount,
    preCumRunUpWinRate,
    preCumRunUpProfitFactor,
    preCumRunUpExpectancy,
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
    preCumRunUpExpectancy > baselineExpectancy &&
    preCumRunUpProfitFactor >= 1.30 &&
    preCumRunUpWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'CORPORATE_ACTION_RUNUP_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_CORPORATE_ACTION_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Corporate Actions, Dividend Trap & Rights Dilution Walk-Forward Evaluator ===');
  console.log('Reading historical Corporate Action snapshots and trade execution outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM corporate_actions_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateCorpActionGate({
    sampleCount,
    preCumRunUpWinRate: 0,
    preCumRunUpProfitFactor: 0,
    preCumRunUpExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${sampleCount} (requires >= 30)`);
}

if (process.argv[1]?.includes('run-corporate-actions-walkforward')) {
  main().catch((err) => {
    console.error('Fatal walk-forward error:', err);
    process.exit(1);
  });
}
