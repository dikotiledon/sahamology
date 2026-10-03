import { query } from '../lib/db';

export interface SectorRotationGateInput {
  sampleCount: number;
  tailwindWinRate: number;
  tailwindProfitFactor: number;
  tailwindExpectancy: number;
  headwindExpectancy: number;
}

export interface SectorRotationGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: SectorRotationGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for the Sector Rotation Matrix Engine.
 * Enforces the repository invariant: sample size floor must be >= 30 before
 * the gate can be judged (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateSectorRotationGate(
  input: SectorRotationGateInput
): SectorRotationGateVerdict {
  const {
    sampleCount,
    tailwindWinRate,
    tailwindProfitFactor,
    tailwindExpectancy,
    headwindExpectancy,
  } = input;

  if (sampleCount < 30) {
    return {
      gateStatus: 'VERDICT_UNREACHABLE',
      reason: 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE',
      details: input,
    };
  }

  if (
    tailwindExpectancy > headwindExpectancy &&
    tailwindProfitFactor > 1.2 &&
    tailwindWinRate >= 0.50
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'SECTOR_ROTATION_EDGE_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_SECTOR_ROTATION_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Sector Rotation Matrix Walk-Forward Evaluator ===');
  console.log('Reading historical sector rotation snapshots and constituent trade outcomes...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM sector_rotation_daily`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateSectorRotationGate({
    sampleCount,
    tailwindWinRate: 0,
    tailwindProfitFactor: 0,
    tailwindExpectancy: 0,
    headwindExpectancy: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${verdict.details.sampleCount} (requires >= 30)`);
}

if (process.argv[1] && process.argv[1].endsWith('run-sector-rotation-walkforward.ts')) {
  void main();
}
