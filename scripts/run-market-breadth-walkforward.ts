import { query } from '../lib/db';

export interface MarketBreadthGateInput {
  sampleCount: number;
  expansionWinRate: number;
  expansionProfitFactor: number;
  expansionExpectancy: number;
  baselineExpectancy: number;
}

export interface MarketBreadthGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: MarketBreadthGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for Market Breadth & Composite Liquidity Engine.
 * Enforces the non-negotiable repository invariant: sample size floor must be >= 30
 * out-of-sample trades before a verdict can be rendered (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateMarketBreadthGate(input: MarketBreadthGateInput): MarketBreadthGateVerdict {
  const {
    sampleCount,
    expansionWinRate,
    expansionProfitFactor,
    expansionExpectancy,
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
    expansionExpectancy > baselineExpectancy &&
    expansionProfitFactor >= 1.30 &&
    expansionWinRate >= 0.52
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'BREADTH_EXPANSION_REGIME_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_BREADTH_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Market Breadth & Composite Liquidity (IHSG Pulse) Walk-Forward Evaluator ===');
  console.log('Reading historical market breadth snapshots and trade execution outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM market_breadth_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateMarketBreadthGate({
    sampleCount,
    expansionWinRate: 0,
    expansionProfitFactor: 0,
    expansionExpectancy: 0,
    baselineExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${sampleCount} (requires >= 30)`);
}

if (process.argv[1] && process.argv[1].endsWith('run-market-breadth-walkforward.ts')) {
  void main();
}
