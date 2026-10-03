import { query } from '../lib/db';

export interface VolumeProfileGateInput {
  sampleCount: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  pocSupportWinRate: number;
}

export interface VolumeProfileGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: {
    sampleCount: number;
    winRate: number;
    profitFactor: number;
    expectancy: number;
    pocSupportWinRate: number;
  };
}

/**
 * Evaluates the out-of-sample walk-forward gate for the Volume Profile Shelves Engine.
 * Enforces the repository invariant: sample size floor must be >= 30 before
 * the gate can be judged (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateVolumeProfileGate(input: VolumeProfileGateInput): VolumeProfileGateVerdict {
  const { sampleCount, winRate, profitFactor, expectancy, pocSupportWinRate } = input;

  if (sampleCount < 30) {
    return {
      gateStatus: 'VERDICT_UNREACHABLE',
      reason: 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE',
      details: { sampleCount, winRate, profitFactor, expectancy, pocSupportWinRate },
    };
  }

  if (expectancy > 0 && profitFactor > 1.2 && winRate >= 0.45 && pocSupportWinRate >= 0.50) {
    return {
      gateStatus: 'PASS',
      reason: 'LIQUIDITY_SHELF_EDGE_VERIFIED',
      details: { sampleCount, winRate, profitFactor, expectancy, pocSupportWinRate },
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_LIQUIDITY_EDGE',
    details: { sampleCount, winRate, profitFactor, expectancy, pocSupportWinRate },
  };
}

async function main() {
  console.log('=== Volume Profile Shelves Walk-Forward Evaluator ===');
  console.log('Reading historical Volume Profile snapshots and trade outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM volume_profile_snapshots`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateVolumeProfileGate({
    sampleCount,
    winRate: 0,
    profitFactor: 0,
    expectancy: 0,
    pocSupportWinRate: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${verdict.details.sampleCount} (requires >= 30)`);
}

if (process.argv[1] && process.argv[1].endsWith('run-volume-profile-walkforward.ts')) {
  void main();
}
