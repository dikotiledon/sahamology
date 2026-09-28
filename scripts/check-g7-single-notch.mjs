#!/usr/bin/env node
/**
 * Leaf 1.3.1 / G4 — prove the G7 stance branch is a single-notch hold.
 *
 * This lives in a file rather than inline in the ledger for one reason: the
 * ledger's CHECK is a shell string, and a JS payload with a regex, a backslash
 * and a quote cannot survive the round trip through double-quoted `node -e`.
 * An inline version failed with an unterminated-quote shell error and, worse,
 * exited 0 with no output — a gate that cannot fail.
 *
 * Four claims, each one a way G7 could do more damage than intended:
 *   1. evaluateGate7 only REPORTS. It must not assign a stance.
 *   2. The armed branch downgrades to WAIT.
 *   3. The armed branch cannot produce AVOID.
 *   4. The armed branch is the LAST else-if, so it is only reachable from
 *      ENTER — which is what makes claims 2 and 3 structurally true rather
 *      than true by inspection.
 */

import { readFileSync } from 'node:fs';

const ev = readFileSync('lib/playbook/evaluate.ts', 'utf8');
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const fn = ev.indexOf('function evaluateGate7');
if (fn < 0) fail('evaluateGate7 is missing');
if (/stance\s*=/.test(ev.slice(fn, fn + 1800))) {
  fail('evaluateGate7 assigns a stance — it must only report');
}

const start = ev.indexOf('let stance: Stance;');
const end = ev.indexOf('// ------------------------------------------------------- thesis');
if (start < 0 || end < 0) fail('the stance ladder was not found');
const ladder = ev.slice(start, end);

// Anchor on the branch's OWN condition, which is the first place the armed
// guard appears inside the ladder.
const anchor = ladder.indexOf(
  "g7Profile === 'veto' && !gates.find((g) => g.id === 'G7')",
);
if (anchor < 0) fail('the stance ladder has no G7 branch');

// Comments are stripped before scanning: this branch's own docstring explains
// WHY it never reaches AVOID, and a comment naming the forbidden value would
// otherwise fail its own check.
const code = (s) => s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// Scope to THIS branch only. A fixed-width window reaches back into G5's AVOID
// branch and reports a violation that is not there.
const rest = ladder.slice(anchor);
const stop = rest.search(/}\s*else\s*if|} else/);
const branch = code(rest.slice(0, stop < 0 ? rest.length : stop));

if (!/WAIT/.test(branch)) fail('the G7 branch does not downgrade to WAIT');
if (/AVOID/.test(branch)) fail('the G7 branch can reach AVOID');

// After the armed branch there must be nothing but the ENTER fallback. If
// another gate were appended below it, the branch would stop being
// ENTER-only and the single notch would become a filter.
const tail = code(stop < 0 ? '' : rest.slice(stop)).replace(/}\s*else\s*{/, '');
const firstStance = tail.split('} else')[0].trim();
if (!firstStance.startsWith("stance = 'ENTER'")) {
  fail(`the G7 branch is not the final else-if; it is followed by: ${firstStance.slice(0, 80)}`);
}

console.log('g7-single-notch-ok');
