import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toFiniteNumber, roundRMultiple } from './numbers';

test("toFiniteNumber('1000') is 1000", () => {
  assert.equal(toFiniteNumber('1000'), 1000);
});

test("toFiniteNumber('nope') is null", () => {
  assert.equal(toFiniteNumber('nope'), null);
});

test('toFiniteNumber keeps a finite number and rejects NaN/Infinity/null', () => {
  assert.equal(toFiniteNumber(950), 950);
  assert.equal(toFiniteNumber(Number.NaN), null);
  assert.equal(toFiniteNumber(Number.POSITIVE_INFINITY), null);
  assert.equal(toFiniteNumber(null), null);
  assert.equal(toFiniteNumber(undefined), null);
});

test("string NUMERIC '1100' <= '950' is true, numeric comparison is false, coerce agrees with numeric", () => {
  assert.equal('1100' <= '950', true);
  assert.equal(1100 <= 950, false);
  const high = toFiniteNumber('1100');
  const stop = toFiniteNumber('950');
  assert.equal(high, 1100);
  assert.equal(stop, 950);
  assert.equal(high! <= stop!, false);
});

test('roundRMultiple is four decimal places', () => {
  assert.equal(roundRMultiple(0.12345), 0.1235);
  assert.equal(roundRMultiple(-1.23456), -1.2346);
});
