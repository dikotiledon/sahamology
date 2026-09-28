import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emaLast, emaSeries } from './ema';

test('constant series gives EMA equal to the constant after the seed', () => {
  const values = new Array(21).fill(100);
  assert.equal(emaLast(values, 20), 100);
});

test('EMA(20) uses alpha 2/21 after an SMA seed', () => {
  // 20 closes all 100 → seed 100. Next close 121 → EMA = 100 + (2/21)*21 = 102.
  const values = [...new Array(20).fill(100), 121];
  assert.ok(Math.abs(emaLast(values, 20)! - 102) < 1e-9);
});

test('nineteen values are not enough for EMA(20)', () => {
  assert.equal(emaLast(new Array(19).fill(100), 20), null);
});

test('emaSeries keeps null until the seed index', () => {
  const series = emaSeries([1, 2, 3, 4, 5], 3); // α=2/4=0.5
  assert.equal(series[0], null);
  assert.equal(series[1], null);
  assert.ok(Math.abs(series[2]! - 2) < 1e-9); // mean(1,2,3)
  // EMA[3] = 2 + 0.5*(4-2) = 3
  assert.ok(Math.abs(series[3]! - 3) < 1e-9);
  // EMA[4] = 3 + 0.5*(5-3) = 4
  assert.ok(Math.abs(series[4]! - 4) < 1e-9);
});
