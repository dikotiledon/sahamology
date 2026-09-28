#!/usr/bin/env node
/**
 * Leaf 1.3.3 / G2 — prove the Phase 4 gate has all eight conditions and that
 * the reporter feeds it the OUT-OF-SAMPLE fold.
 *
 * A script rather than an inline `node -e`: the payload contains regex
 * escapes and quotes that do not survive a double-quoted shell string, and an
 * inline version already exited 0 with no output on a correct source.
 *
 * The original check asked the pure gate module for the words "oosOnly" or
 * "fold". Those belong to the REPORTER, not to a gate that receives two
 * already-scored arms, so the check could only ever fail on correct code. What
 * actually matters is narrower and testable:
 *
 *   1. all eight conditions exist on the gate's own result,
 *   2. the gate is a SEPARATE function from the Phase 2 and Phase 3 gates, so
 *      evaluating Phase 4 cannot move a shipped verdict,
 *   3. the reporter scores the OOS fold for BOTH arms and passes those to the
 *      gate — a reporter that passed the in-sample fold would make the whole
 *      comparison meaningless while still looking well-formed.
 */

import { readFileSync } from 'node:fs';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const gateSrc = readFileSync('lib/playbook/walk-forward-p2.ts', 'utf8');
const reporterSrc = readFileSync('scripts/run-phase4-walkforward.ts', 'utf8');

const start = gateSrc.indexOf('export function evaluatePhase4ShipGate');
if (start < 0) fail('evaluatePhase4ShipGate is missing');
const body = gateSrc.slice(start, start + 5000);

const CONDITIONS = [
  'beatExpectancy',
  'beatPF',
  'sampleFloorMet',
  'noCollapse',
  'macroCoverageMet',
  'incompleteCapMet',
  'raisePlausibilityMet',
  'unscoredCapMet',
];
for (const key of CONDITIONS) {
  if (!body.includes(key)) fail(`condition ${key} is missing from the Phase 4 gate`);
}
// Each condition must be computed, not merely named in the interface.
if (!/const conditions: Phase4ShipConditions = \{[\s\S]*?\};/.test(body)) {
  fail('the gate never assembles a conditions object');
}
// An unmeasurable sample must never read FAIL.
if (!/!sampleFeasible\s*\?\s*'VERDICT_UNREACHABLE'/.test(body)) {
  fail('an unfeasible sample does not short-circuit to VERDICT_UNREACHABLE');
}

// The Phase 4 gate must be its own function: a shared implementation would put
// a Phase 4 concept inside the function that produces the shipped Phase 2 and
// Phase 3 verdicts.
for (const other of ['evaluateShipGate', 'evaluatePhase3ShipGate']) {
  const at = gateSrc.indexOf(`export function ${other}`);
  if (at < 0) fail(`${other} disappeared`);
  const sig = gateSrc.slice(at, gateSrc.indexOf('{', at));
  if (/macro|held|phase4/i.test(sig)) {
    fail(`${other} now takes a Phase 4 argument — a caller that omits it would get a silent PASS-shaped result`);
  }
}

// The reporter must score BOTH arms on the OOS fold and hand those exact
// objects to the gate.
if (!/const phase3 = oosSample\('phase-3-card'\)/.test(reporterSrc)) {
  fail('the reporter does not score the Phase 3 baseline on the OOS fold');
}
if (!/const phase4 = oosSample\('phase-4-card'\)/.test(reporterSrc)) {
  fail('the reporter does not score the Phase 4 candidate on the OOS fold');
}
if (!/evaluatePhase4ShipGate\(\{[\s\S]*?phase3,[\s\S]*?phase4,/.test(reporterSrc)) {
  fail('the gate is not fed the OOS-scored arms');
}

console.log('eight-conditions-ok');
