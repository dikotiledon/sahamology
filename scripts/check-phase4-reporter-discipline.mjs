#!/usr/bin/env node
/**
 * Leaf 1.3.3 / G3 + G4 — the reporter's verdict discipline and its read-only
 * replay path.
 *
 * Both were inline `node -e` checks. G3 failed on correct code because it
 * scanned from the LAST `catch` to the end of file, which includes a COMMENT
 * explaining why the error path must not print FAIL — the comment contains the
 * literal string it was forbidding. G4 failed because it forbade the symbols
 * `IHSG` and `USDIDR` anywhere in the file, but a reporter must name the legs
 * it reads; what it must not do is FETCH them.
 *
 * So this file checks the behaviours, not the vocabulary.
 */

import { readFileSync } from 'node:fs';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const src = readFileSync('scripts/run-phase4-walkforward.ts', 'utf8');

/** Strip comments: a comment that names a forbidden string is not a use of it. */
const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// --- G3: verdict discipline -----------------------------------------------

// Three print SITES, one per exit: the empty dataset, the unreachable branch,
// and the measured branch. The measured branch must interpolate the gate's own
// verdict rather than hardcoding PASS or FAIL, so a template literal is the
// correct form there and is accepted alongside the two literals.
const literalTokens = code.match(/console\.log\('SHIP_GATE=[A-Z_]+'\)/g) ?? [];
const templateTokens = code.match(/console\.log\(`SHIP_GATE=\$\{[^}]+\}`\)/g) ?? [];
const sites = literalTokens.length + templateTokens.length;
if (sites < 3) {
  fail(
    `the reporter prints ${sites} SHIP_GATE site(s) (empty / unreachable / measured); expected at least 3`,
  );
}
if (templateTokens.length === 0) {
  fail('the measured branch hardcodes its verdict instead of printing the gate result');
}
for (const t of literalTokens) {
  if (!/^console\.log\('SHIP_GATE=(PASS|FAIL|VERDICT_UNREACHABLE)'\)$/.test(t)) {
    fail(`a SHIP_GATE site is not a single literal verdict print: ${t}`);
  }
}

// The environment-error path must exit non-zero and must NOT print a verdict.
// An unreachable database is an environment error, not a measured loss of
// edge; printing FAIL would be a false claim about the code.
const catchAt = code.lastIndexOf('main().catch');
if (catchAt < 0) fail('the reporter has no top-level error handler');
const tail = code.slice(catchAt);
if (!/process\.exit\(1\)/.test(tail)) {
  fail('an environment error would not exit non-zero');
}
if (/SHIP_GATE=/.test(tail)) {
  fail('the error path prints a SHIP_GATE token — an environment error is not a verdict');
}

// --- G4: the replay path never fetches macro data -------------------------

// The reporter MUST name the legs it reads, so naming a symbol is not the
// violation. Fetching one is. Assert the absence of the vendor helpers and of
// any direct HTTP client, and assert that the bars come from the stored table.
if (/fetchHistorical|stockbitFetch|exodus\.stockbit/i.test(code)) {
  fail('the reporter calls the vendor history endpoint — a replay must read stored bars only');
}
if (/\bfetch\s*\(/.test(code)) {
  fail('the reporter performs an HTTP call — a replay must read stored bars only');
}
for (const fn of ['getMacroSnapshot', 'getMacroSnapshotWindow', 'buildReplayMacro']) {
  if (!src.includes(fn)) fail(`the reporter does not read the stored macro snapshot (${fn})`);
}
if (!/buildReplayMacro\(signal, macroBars/.test(code)) {
  fail('the reporter does not build its regime from the bars it read');
}

console.log('verdict-token-discipline-ok replay-no-fetch-ok');
