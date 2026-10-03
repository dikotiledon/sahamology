import { query } from '../lib/db';

export interface WyckoffGateInput {
  sampleCount: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
}

export interface WyckoffGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: {
    sampleCount: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
  };
}

/**
 * Evaluates the out-of-sample walk-forward gate for the Wyckoff Structural Screener.
 * Enforces the repository invariant: sample size floor must be >= 30 before
 * the gate can be judged (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateWyckoffGate(input: WyckoffGateInput): WyckoffGateVerdict {
  const { sampleCount, winRate, profitFactor, expectancy } = input;

  if (sampleCount < 30) {
    return {
      gateStatus: 'VERDICT_UNREACHABLE',
      reason: 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE',
      details: { sampleCount, winRate, profitFactor, expectancy },
    };
  }

  if (expectancy > 0 && profitFactor > 1.2 && winRate >= 0.45) {
    return {
      gateStatus: 'PASS',
      reason: 'STRUCTURAL_CONFLUENCE_VERIFIED',
      details: { sampleCount, winRate, profitFactor, expectancy },
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_EDGE',
    details: { sampleCount, winRate, profitFactor, expectancy },
  };
}

async function main() {
  console.log('=== Wyckoff Structural Screener Walk-Forward Evaluator ===');
  console.log('Reading historical Wyckoff daily assessments and trade outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM wyckoff_daily_assessments`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateWyckoffGate({
    sampleCount,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${verdict.details.sampleCount} (requires >= 30)`);
}

if (process.argv[1] && process.argv[1].endsWith('run-wyckoff-walkforward.ts')) {
  void main();
}
