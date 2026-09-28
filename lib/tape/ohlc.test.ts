import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isUsableBar, type OhlcBar } from './ohlc';

const base: OhlcBar = { date: '2026-09-24', open: 100, high: 110, low: 99, close: 105 };

test('usable bar passes', () => {
  assert.equal(isUsableBar(base), true);
});

test('high below low is unusable', () => {
  assert.equal(isUsableBar({ ...base, high: 98 }), false);
});

test('high below open is unusable', () => {
  assert.equal(isUsableBar({ ...base, high: 99 }), false);
});

test('high below close is unusable', () => {
  assert.equal(isUsableBar({ ...base, high: 104 }), false);
});

test('low above open is unusable', () => {
  assert.equal(isUsableBar({ ...base, low: 101 }), false);
});

test('low above close is unusable', () => {
  assert.equal(isUsableBar({ ...base, low: 106 }), false);
});

test('non-finite close is unusable', () => {
  assert.equal(isUsableBar({ ...base, close: Number.NaN }), false);
});

test('non-positive price is unusable', () => {
  assert.equal(isUsableBar({ ...base, low: 0 }), false);
});

test('bad date format is unusable', () => {
  assert.equal(isUsableBar({ ...base, date: '24-09-2026' }), false);
});
