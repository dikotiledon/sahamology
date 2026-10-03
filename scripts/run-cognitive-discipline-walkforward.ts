import { query } from '../lib/db';

export interface CognitiveDisciplineGateInput {
  sampleCount: number;
  disciplinedTradePct: number;
  disciplinedExpectancy: number;
  undisciplinedExpectancy: number;
  disciplinedProfitFactor: number;
  undisciplinedProfitFactor: number;
}

export interface CognitiveDisciplineGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: CognitiveDisciplineGateInput;
}

/**
 * Evaluates the out-of-sample walk-forward gate for the Cognitive Journal & Discipline Engine.
 * Enforces the repository invariant: sample size floor must be >= 30 before
 * the gate can be judged (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateCognitiveDisciplineGate(
  input: CognitiveDisciplineGateInput
): CognitiveDisciplineGateVerdict {
  const {
    sampleCount,
    disciplinedTradePct,
    disciplinedExpectancy,
    undisciplinedExpectancy,
    disciplinedProfitFactor,
  } = input;

  if (sampleCount < 30) {
    return {
      gateStatus: 'VERDICT_UNREACHABLE',
      reason: 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE',
      details: input,
    };
  }

  if (
    disciplinedExpectancy > undisciplinedExpectancy &&
    disciplinedProfitFactor > 1.2 &&
    disciplinedTradePct >= 0.60
  ) {
    return {
      gateStatus: 'PASS',
      reason: 'DISCIPLINE_EDGE_STATISTICALLY_VERIFIED',
      details: input,
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'INSUFFICIENT_DISCIPLINE_EDGE',
    details: input,
  };
}

async function main() {
  console.log('=== Cognitive Post-Trade Discipline Walk-Forward Evaluator ===');
  console.log('Reading historical cognitive trade reviews and discipline scores...');

  let sampleCount = 0;
  try {
    const res = await query(`SELECT COUNT(*) as count FROM cognitive_trade_reviews`);
    if (res && res.rows && res.rows[0]) {
      sampleCount = Number((res.rows[0] as { count?: unknown }).count || 0);
    }
  } catch {
    console.log('PostgreSQL database offline or unconfigured. Evaluating default scaffold state.');
  }

  const verdict = evaluateCognitiveDisciplineGate({
    sampleCount,
    disciplinedTradePct: 0,
    disciplinedExpectancy: 0,
    undisciplinedExpectancy: 0,
    disciplinedProfitFactor: 0,
    undisciplinedProfitFactor: 0,
  });

  console.log(`Gate Status: ${verdict.gateStatus}`);
  console.log(`Reason: ${verdict.reason}`);
  console.log(`Recorded Out-of-sample size: ${verdict.details.sampleCount} (requires >= 30)`);
}

if (process.argv[1] && process.argv[1].endsWith('run-cognitive-discipline-walkforward.ts')) {
  void main();
}
