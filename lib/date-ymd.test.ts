import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ymdOf } from './date-ymd';

test('pg DATE Date object normalizes to its own calendar date (not UTC)', () => {
  // new Date(2026, 8, 24) is local midnight 2026-09-24 in this process's TZ.
  const d = new Date(2026, 8, 24);
  assert.equal(ymdOf(d), '2026-09-24');
});

test('string YYYY-MM-DD passes through unchanged', () => {
  assert.equal(ymdOf('2026-09-24'), '2026-09-24');
});

test('null and undefined fold to empty string', () => {
  assert.equal(ymdOf(null), '');
  assert.equal(ymdOf(undefined), '');
});

test('datetime-like string keeps its date prefix', () => {
  assert.equal(ymdOf('2026-09-24T00:00:00.000Z'), '2026-09-24');
});
