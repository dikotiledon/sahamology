import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultCostModel, roundTripCostRate } from './costs';

test('round-trip cost sums buy, sell, and two haircuts', () => {
  const cost = defaultCostModel();
  assert.equal(
    roundTripCostRate(cost),
    cost.buyFeeRate + cost.sellFeeRate + 2 * cost.spreadHaircutRate
  );
});

test('default cost model is documented IDX stand-in', () => {
  const cost = defaultCostModel();
  assert.equal(cost.buyFeeRate, 0.0015);
  assert.equal(cost.sellFeeRate, 0.0025);
  assert.equal(cost.spreadHaircutRate, 0.001);
});

test('custom cost model round-trips', () => {
  assert.equal(
    roundTripCostRate({ buyFeeRate: 0.001, sellFeeRate: 0.002, spreadHaircutRate: 0.0005 }),
    0.001 + 0.002 + 0.001
  );
});
