/**
 * Leaf 1.1.4 — structural proof that the macro capture sits OUTSIDE the
 * per-emiten loop.
 *
 * A regex over the source can be fooled by indentation and comments. This
 * parses the real TypeScript AST and asks the only question that matters: is
 * the `captureMacro(...)` call statement an ancestor of, or a descendant of,
 * the `for (const emiten of toAnalyze)` loop?
 *
 * If it is inside, the daily job would fetch the same five market-wide series
 * once per watchlist member — a rate-limit exhaustion bug (plan D5) that no
 * amount of unit testing would catch, because every individual call succeeds.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';

const JOB = join(process.cwd(), 'lib', 'jobs', 'run-watchlist-analysis.ts');
const source = readFileSync(JOB, 'utf8');
const sf = ts.createSourceFile(JOB, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

/** Every call expression whose callee is the given identifier. */
const callsNamed = (name: string): ts.CallExpression[] => {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
};

/** The nearest enclosing statement, walking up from a node. */
const enclosingStatement = (node: ts.Node): ts.Node | null => {
  let cur: ts.Node | undefined = node;
  while (cur) {
    const parent: ts.Node | undefined = cur.parent;
    if (parent && (ts.isBlock(parent) || ts.isSourceFile(parent) || ts.isForOfStatement(parent) || ts.isForStatement(parent))) {
      return parent;
    }
    cur = parent;
  }
  return null;
};

/** The ancestor chain of a node, nearest first. */
const ancestors = (node: ts.Node): ts.Node[] => {
  const chain: ts.Node[] = [];
  let cur = node.parent;
  while (cur) {
    chain.push(cur);
    cur = cur.parent;
  }
  return chain;
};

describe('macro capture placement', () => {
  it('finds exactly one captureMacro call in the job', () => {
    const calls = callsNamed('captureMacro');
    assert.equal(calls.length, 1, `expected one macro capture per run, found ${calls.length}`);
  });

  it('finds the per-emiten loop', () => {
    const loops: ts.ForOfStatement[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isForOfStatement(node) && /toAnalyze|emitens/.test(node.getText(sf).slice(0, 80))) {
        loops.push(node);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    assert.ok(loops.length >= 1, 'the per-emiten loop was not found — this check cannot prove anything');
  });

  it('places the capture call OUTSIDE the per-emiten loop', () => {
    const [call] = callsNamed('captureMacro');
    const chain = ancestors(call);
    const insideLoop = chain.some(
      (n) => ts.isForOfStatement(n) || ts.isForStatement(n) || ts.isForInStatement(n),
    );
    assert.equal(
      insideLoop,
      false,
      'captureMacro is inside a loop — the job would refetch five market-wide series per emiten (D5)',
    );
  });

  it('places the capture call BEFORE the per-emiten loop', () => {
    const [call] = callsNamed('captureMacro');
    let loopNode: ts.ForOfStatement | null = null;
    const visit = (node: ts.Node): void => {
      if (ts.isForOfStatement(node) && node.getText(sf).includes('toAnalyze')) loopNode = node;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    assert.ok(loopNode, 'the per-emiten loop was not found');
    // The capture's statement must come earlier in the file than the loop.
    assert.ok(
      call.getStart(sf) < (loopNode as ts.ForOfStatement).getStart(sf),
      'the capture runs after the loop starts',
    );
  });

  it('assigns the result to a session-scoped binding, not a per-emiten one', () => {
    const [call] = callsNamed('captureMacro');
    const stmt = enclosingStatement(call);
    assert.ok(stmt, 'the capture call has no enclosing statement');
    const text = stmt!.getText(sf);
    assert.match(text, /const\s+macroCapture/, 'the capture result must be bound outside the loop');
  });
});

describe('the other two capture flags are untouched', () => {
  it('still writes capture_incomplete and fundamentals_incomplete', () => {
    assert.match(source, /capture_incomplete:/);
    assert.match(source, /fundamentals_incomplete:/);
  });

  it('writes macro_incomplete alongside them on the same save', () => {
    assert.match(source, /macro_incomplete:\s*macroCapture\.incomplete/);
  });

  it('does not let the macro module touch another capture flag', () => {
    const mod = readFileSync(join(process.cwd(), 'lib', 'jobs', 'macro-capture.ts'), 'utf8');
    assert.doesNotMatch(mod, /capture_incomplete|fundamentals_incomplete/);
  });
});
