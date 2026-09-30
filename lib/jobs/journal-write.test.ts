/**
 * Structural proof that the daily job flattens the journal payload, logs
 * journal failures onto the job error list, and fail-closes the capture guard.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const JOB = join(process.cwd(), 'lib', 'jobs', 'run-watchlist-analysis.ts');
const source = readFileSync(JOB, 'utf8');
const sf = ts.createSourceFile(JOB, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

function collect(visit: (node: ts.Node) => void): void {
  const walk = (node: ts.Node): void => {
    visit(node);
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

test('the job flattens the card through buildJournalPayload before saveDecisionJournal', () => {
  assert.match(source, /buildJournalPayload/);
  let cardKeyOnSave = false;
  collect((node) => {
    if (!ts.isCallExpression(node)) return;
    if (node.expression.getText(sf) !== 'saveDecisionJournal') return;
    const arg = node.arguments[0];
    if (!arg) return;
    const text = arg.getText(sf);
    if (/\bcard\s*:/.test(text) && !/buildJournalPayload/.test(text)) cardKeyOnSave = true;
    if (ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'card') cardKeyOnSave = true;
        if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'card') cardKeyOnSave = true;
      }
    }
  });
  assert.equal(cardKeyOnSave, false);
});

test('journal failure increments the job error list', () => {
  const idx = source.indexOf('Failed to journal decision card');
  assert.ok(idx >= 0);
  assert.match(source.slice(idx, idx + 800), /errors\.push/);
});

test('journal failure does not count the emiten as a job success', () => {
  const saveAt = source.indexOf('await saveDecisionJournal');
  const catchAt = source.indexOf('catch (journalError)');
  const outerCatchAt = source.indexOf('} catch (error)', catchAt);
  assert.ok(saveAt >= 0 && catchAt > saveAt && outerCatchAt > catchAt);
  assert.doesNotMatch(source.slice(catchAt, outerCatchAt), /results\.push/);
  assert.doesNotMatch(source.slice(catchAt, outerCatchAt), /Successfully analyzed/);
  assert.match(source.slice(saveAt, catchAt), /results\.push/);
});

test('capture-guard lookup failure aborts instead of proceeding', () => {
  assert.doesNotMatch(source, /proceeding without the guard/);
  assert.match(source, /aborting rather than overwriting a closed session/);
});

test('skippedCaptured counts from the real history rows, not a leftover reconstruction', () => {
  assert.match(source, /skippedCaptured = countCapturedEmitens\(emitens, rows\)/);
  assert.doesNotMatch(
    source,
    /countCapturedEmitens\(emitens, emitens\.map/,
  );
});

test('playbook boundary matches the stock route inputs', () => {
  for (const token of [
    'getTokenStatus',
    'classifyFundamentals',
    'classifyRegime',
    'openCard',
    'g1Profile',
    'g5Profile',
    'g7Profile',
    'isWeekend',
    'isIdxHoliday',
  ]) {
    assert.ok(source.includes(token), `missing ${token}`);
  }
});
