#!/usr/bin/env node
/**
 * Leaf 1.3.2 / G2 — prove the replay refuses unusable macro data.
 *
 * This is a script rather than an inline `node -e` for the same reason as
 * check-g7-single-notch.mjs: the payload contains regex escapes that do not
 * survive a round trip through a double-quoted shell string. The inline version
 * exited 0 with NO OUTPUT on a correct source — a gate that cannot fail, and
 * the exact class of bug this whole ledger exists to prevent.
 *
 * Four claims about `buildReplayMacro`:
 *   1. It can return null. A walk-forward treats a null as "unscored", so
 *      without this the reporter would have no honest way to drop a row.
 *   2. A degraded capture is honoured AS A REFUSAL. Checking only that the
 *      token `macro_incomplete` appears proves nothing: the original gate
 *      passed on a buildReplayMacro that read the flag and then ignored it.
 *   3. A forward-dated bar is DROPPED, not clamped. Clamping is precisely the
 *      lookahead this layer exists to prevent.
 *   4. There is no vendor call. A replay must not re-fetch today's macro
 *      history and grade a past decision with it.
 */

import { readFileSync } from 'node:fs';

const src = readFileSync('lib/playbook/replay.ts', 'utf8');
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const start = src.indexOf('export function buildReplayMacro');
if (start < 0) fail('buildReplayMacro is missing');
const body = src.slice(start, start + 2400);

if (!/return null/.test(body)) {
  fail('buildReplayMacro can return something other than null for unusable data');
}

// A refusal, not a mention: the comparison itself must be able to bail out.
if (!/signal\.macro_incomplete\s*===\s*true\)\s*return null/.test(body)) {
  fail('macro_incomplete is not honoured as a refusal — a degraded capture would be scored');
}

// The PIT cut must drop, not clamp. A clamp looks like a fix and is the
// lookahead this whole layer exists to prevent. Match the comparison however it
// is written (`bar.barDate > fromDate` or `String(bar.barDate) > fromDate`),
// and reject an assignment to barDate in the same statement, which is what a
// clamp looks like.
if (!/bar\.barDate\)?\s*>\s*fromDate\)\s*continue/.test(body)) {
  fail('forward-dated bars are not dropped — a replay would grade a past decision with future prices');
}
if (/bar\.barDate\s*=[^=]/.test(body)) {
  fail('a bar date is being REWRITTEN — clamping a forward-dated bar is the lookahead this layer exists to prevent');
}

if (/fetch|stockbit/i.test(body)) {
  fail('buildReplayMacro performs a vendor call');
}

console.log('replay-macro-fail-closed-to-unscored-ok');
