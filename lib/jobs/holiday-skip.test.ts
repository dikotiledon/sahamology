/**
 * Structural proof that the daily job skips holidays before Stockbit,
 * creates the job log first, and heartbeats the macro capture boundary.
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

function calleeText(node: ts.CallExpression): string {
  return node.expression.getText(sf);
}

function callsNamed(name: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  collect((node) => {
    if (ts.isCallExpression(node) && calleeText(node) === name) out.push(node);
  });
  return out;
}

function objectPropString(obj: ts.ObjectLiteralExpression, name: string): string | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    if (prop.name.getText(sf) !== name) continue;
    const init = prop.initializer;
    if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text;
  }
  return undefined;
}

function objectHasKey(obj: ts.ObjectLiteralExpression, name: string): boolean {
  return obj.properties.some((prop) => {
    if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
      return prop.name.getText(sf) === name;
    }
    return false;
  });
}

test('skip return precedes first fetchWatchlist CallExpression', () => {
  const fetches = callsNamed('fetchWatchlist');
  assert.ok(fetches.length >= 1);
  const firstFetch = fetches[0]!;
  let skipReturn: ts.ReturnStatement | undefined;
  collect((node) => {
    if (!ts.isIfStatement(node)) return;
    const cond = node.expression.getText(sf);
    if (!/calendar\.kind/.test(cond) || !/skip/.test(cond)) return;
    const visit = (n: ts.Node): void => {
      if (ts.isReturnStatement(n) && !skipReturn) skipReturn = n;
      ts.forEachChild(n, visit);
    };
    visit(node);
  });
  assert.ok(skipReturn);
  assert.ok(skipReturn!.getEnd() < firstFetch.getStart(sf));
});

test('create and first append precede first fetchWatchlist; exactly one create', () => {
  const fetches = callsNamed('fetchWatchlist');
  const creates = callsNamed('createBackgroundJobLog');
  const appends = callsNamed('appendBackgroundJobLogEntry');
  assert.equal(creates.length, 1);
  assert.ok(appends.length >= 1);
  assert.ok(creates[0]!.getStart(sf) < fetches[0]!.getStart(sf));
  assert.ok(appends[0]!.getStart(sf) < fetches[0]!.getStart(sf));
});

test('macro capture has proximity appends with starting and done messages', () => {
  const macros = callsNamed('captureMacro');
  const appends = callsNamed('appendBackgroundJobLogEntry');
  assert.equal(macros.length >= 1, true);
  const capture = macros[0]!;
  const before = appends.filter((a) => a.getEnd() <= capture.getStart(sf));
  const after = appends.filter((a) => a.getStart(sf) >= capture.getEnd());
  assert.ok(before.length >= 1);
  assert.ok(after.length >= 1);
  const nearestBefore = before.reduce((best, cur) => (cur.getStart(sf) > best.getStart(sf) ? cur : best));
  const nearestAfter = after.reduce((best, cur) => (cur.getStart(sf) < best.getStart(sf) ? cur : best));
  assert.ok(capture.getStart(sf) - nearestBefore.getEnd() <= 2000);
  assert.ok(nearestAfter.getStart(sf) - capture.getEnd() <= 2000);
  const beforeArg = nearestBefore.arguments[1];
  const afterArg = nearestAfter.arguments[1];
  assert.ok(beforeArg && ts.isObjectLiteralExpression(beforeArg));
  assert.ok(afterArg && ts.isObjectLiteralExpression(afterArg));
  assert.equal(objectPropString(beforeArg, 'message'), 'macro capture starting');
  assert.equal(objectPropString(afterArg, 'message'), 'macro capture done');
});

test('empty-universe metadata includes skip_reason and universe_count', () => {
  let found = false;
  collect((node) => {
    if (!ts.isCallExpression(node) || calleeText(node) !== 'updateBackgroundJobLog') return;
    for (const arg of node.arguments) {
      if (!ts.isObjectLiteralExpression(arg)) continue;
      const meta = arg.properties.find((prop) => ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'metadata');
      if (!meta || !ts.isPropertyAssignment(meta) || !ts.isObjectLiteralExpression(meta.initializer)) continue;
      if (objectPropString(meta.initializer, 'skip_reason') === 'empty-universe' && objectHasKey(meta.initializer, 'universe_count')) {
        found = true;
      }
    }
  });
  assert.equal(found, true);
});

test('create-failure CatchClause returns success false', () => {
  let found = false;
  collect((node) => {
    if (!ts.isTryStatement(node) || !node.catchClause) return;
    if (!node.tryBlock.getText(sf).includes('createBackgroundJobLog')) return;
    const visit = (n: ts.Node): void => {
      if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(n.expression)) {
        const success = n.expression.properties.find(
          (prop) => ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'success',
        );
        if (success && ts.isPropertyAssignment(success) && success.initializer.kind === ts.SyntaxKind.FalseKeyword) {
          found = true;
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(node.catchClause);
  });
  assert.equal(found, true);
});

test('isIdxSession stays the Phase 5 freeze expression', () => {
  assert.match(source, /isIdxSession:\s*!isWeekend\(today\)\s*&&\s*!isIdxHoliday\(today\)/);
});
