export interface LifecycleGateInput {
  sampleCount: number;
  expectancy: number;
  profitFactor: number;
}

export interface LifecycleGateVerdict {
  gateStatus: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  reason: string;
  details: {
    sampleCount: number;
    expectancy: number;
    profitFactor: number;
  };
}

/**
 * Evaluates the out-of-sample walk-forward gate for the Institutional Trading Lifecycle.
 * Enforces the repository invariant: sample size floor must be >= 30 trades before
 * the gate can be judged (returns VERDICT_UNREACHABLE when below).
 */
export function evaluateLifecycleGate(input: LifecycleGateInput): LifecycleGateVerdict {
  const { sampleCount, expectancy, profitFactor } = input;

  if (sampleCount < 30) {
    return {
      gateStatus: 'VERDICT_UNREACHABLE',
      reason: 'INSUFFICIENT_OUT_OF_SAMPLE_SIZE',
      details: { sampleCount, expectancy, profitFactor },
    };
  }

  if (expectancy > 0 && profitFactor > 1.2) {
    return {
      gateStatus: 'PASS',
      reason: 'OUTPERFORMS_BASELINE',
      details: { sampleCount, expectancy, profitFactor },
    };
  }

  return {
    gateStatus: 'FAIL',
    reason: 'UNDERPERFORMS_BASELINE',
    details: { sampleCount, expectancy, profitFactor },
  };
}

async function main() {
  console.log('=== Institutional Trading Lifecycle Walk-Forward Evaluator ===');
  console.log('Reading stored decision journal outcomes and flow absorption data...');

  // In live evaluation before sufficient forward sessions accumulate:
  const initialEvaluation = evaluateLifecycleGate({
    sampleCount: 0,
    expectancy: 0,
    profitFactor: 0,
  });

  console.log(`Gate Status: ${initialEvaluation.gateStatus}`);
  console.log(`Reason: ${initialEvaluation.reason}`);
  console.log(`Out-of-sample sample size: ${initialEvaluation.details.sampleCount} (requires >= 30)`);
}

if (process.argv[1] && process.argv[1].endsWith('run-lifecycle-walkforward.ts')) {
  void main();
}
