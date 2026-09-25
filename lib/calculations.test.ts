import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFraksi, calculateTargets } from './calculations';

test('fraksi table', () => {
  assert.equal(getFraksi(199), 1);
  assert.equal(getFraksi(200), 2);
  assert.equal(getFraksi(499), 2);
  assert.equal(getFraksi(500), 5);
  assert.equal(getFraksi(1999), 5);
  assert.equal(getFraksi(2000), 10);
  assert.equal(getFraksi(4999), 10);
  assert.equal(getFraksi(5000), 25);
});

test('happy path stays finite and rounded', () => {
  const r = calculateTargets(400, 10000, 450, 350, 500, 500, 400);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(Number.isFinite(r.targetRealistis1), true);
    assert.equal(Number.isFinite(r.targetMax), true);
    assert.equal(r.totalPapan, Math.round(r.totalPapan));
  }
});

test('ara === arb is degenerate_book', () => {
  const r = calculateTargets(400, 10000, 400, 400, 500, 500, 400);
  assert.deepEqual(r, { ok: false, reason: 'degenerate_book' });
});

test('zero bid+offer is degenerate_book', () => {
  const r = calculateTargets(400, 10000, 450, 350, 0, 0, 400);
  assert.deepEqual(r, { ok: false, reason: 'degenerate_book' });
});

test('zero papan via zero fraksi cannot be reached, but non-finite is rejected', () => {
  const r = calculateTargets(400, 10000, 450, 350, NaN, 500, 400);
  assert.equal(r.ok, false);
});
