#!/usr/bin/env node
/**
 * Leaf 1.3.4 / G2 + G3 — the live route and the environment contract.
 *
 * A script rather than an inline `node -e`, for the reason that has bitten
 * this ledger four times now: regex escapes and quotes do not survive a
 * double-quoted shell string, and the failure mode is a silent exit 0.
 *
 * Two original checks were checking the wrong thing, and both failed on
 * CORRECT code:
 *
 *   G2 searched for `getMacroSnapshot` and took the FIRST hit, which is the
 *       import statement at the top of the file. The window before it contains
 *       no `isToday`, so the gate reported an ungated read that does not exist.
 *       The read IS gated; the gate was looking at the import.
 *
 *   G3 matched `PLAYBOOK_G7_PROFILE=([^\n#]*)` and took the first match, which
 *       is the descriptive comment line listing `off|visible|veto`. The actual
 *       assignment further down reads `off`, which is what the gate wanted.
 *
 * Both are fixed here by anchoring on the real construct: the CALL site for
 * G2, and the assignment (a line whose value is a single token) for G3.
 */

import { readFileSync } from 'node:fs';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const route = readFileSync('app/api/stock/route.ts', 'utf8');
const env = readFileSync('.env.example', 'utf8');

// --- G2: the live macro read is gated on isToday ----------------------------

if (!/PLAYBOOK_G7_PROFILE/.test(route)) fail('the route does not read PLAYBOOK_G7_PROFILE');
if (!/g7Profile/.test(route)) fail('the route does not pass g7Profile');

// The CALL, not the import. `getMacroSnapshotWindow(` with a paren is the
// invocation; the import line ends with `,` or `}`.
const callSites = [...route.matchAll(/getMacroSnapshotWindow\(/g)].map((m) => m.index ?? -1);
if (callSites.length === 0) fail('the route never calls getMacroSnapshotWindow');

// Whether the call is INSIDE the isToday guard is a scope question, and scope
// questions are not answered by counting braces: the guarded block has its own
// braces (a for-loop, a try), so a brace count disagrees with itself. Use the
// TypeScript parser, which is already a dependency, and walk the real AST.
import ts from 'typescript';

const sf = ts.createSourceFile('route.ts', route, ts.ScriptTarget.Latest, true);

let guarded = 0;
const visit = (node) => {
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'getMacroSnapshotWindow'
  ) {
    // Walk up the parents looking for an enclosing `if (isToday)`.
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isIfStatement(p) && /isToday/.test(p.expression.getText(sf))) {
        guarded += 1;
        break;
      }
      if (ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p)) break;
    }
  }
  ts.forEachChild(node, visit);
};
visit(sf);

if (callSites.length === 0) fail('the route never calls getMacroSnapshotWindow');
if (guarded !== callSites.length) {
  fail(
    `${callSites.length - guarded} of ${callSites.length} macro read(s) are not inside an isToday guard — a historical session would be graded with today's bars`,
  );
}

// The profile must degrade to 'off' on anything unrecognised, so a typo in the
// deployment can never arm a hold. Read the initialiser's own text rather than
// guessing at its layout: a nested ternary can be formatted many ways.
let profileInit = '';
const findProfile = (node) => {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(sf) === 'g7Profile' &&
    node.initializer
  ) {
    profileInit = node.initializer.getText(sf);
  }
  ts.forEachChild(node, findProfile);
};
findProfile(sf);
if (!profileInit) fail('the route has no g7Profile declaration');
for (const value of ['veto', 'visible', 'off']) {
  if (!new RegExp(`'${value}'`).test(profileInit)) {
    fail(`the g7Profile resolver does not handle '${value}'`);
  }
}
// The LAST alternative must be the off fallback, so an unrecognised value
// cannot arm anything.
const lastValue = profileInit.match(/'([a-z]+)'\s*$/)?.[1];
if (lastValue !== 'off') {
  fail(`the g7Profile resolver falls back to '${lastValue}', not 'off'`);
}

console.log('route-g7-ok');

// --- G3: the documented default is off --------------------------------------

// Take the ASSIGNMENT, not the descriptive comment: the value must be a single
// token, so `off|visible|veto` (a menu in a comment) cannot satisfy it.
const assignment = env.match(/^PLAYBOOK_G7_PROFILE\s*=\s*(\S*)\s*$/m);
if (!assignment) {
  fail('.env.example has no PLAYBOOK_G7_PROFILE assignment line');
}
if (assignment[1] !== 'off') {
  fail(`the documented default is not off: ${assignment[1]}`);
}

// The USDIDR / JISDOR relationship must be stated, and stated as a PROXY.
if (!/JISDOR/i.test(env)) fail('.env.example never mentions JISDOR');
if (!/proxy/i.test(env)) {
  fail('.env.example does not say the USDIDR feed is a JISDOR proxy rather than JISDOR itself');
}

console.log('env-doc-ok');
