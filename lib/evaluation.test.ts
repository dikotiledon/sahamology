import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateTrade, type TradeEvaluationInput } from './evaluation';
import { roundTripCostRate, defaultCostModel } from './playbook/costs';

const baseInput: TradeEvaluationInput = {
  entryPrice: 1000,
  targetR1: 1050,
  invalidation: 970,
  horizonDays: 5,
};

const COST_RATE = roundTripCostRate(defaultCostModel()); // 0.006

test('target hit within horizon wins', () => {
  const result = evaluateTrade(baseInput, [
    { date: '2026-09-25', open: 1005, high: 1060, low: 990, close: 1040 },
  ]);
  assert.ok(result !== null);
  if (result) {
    assert.equal(result.exit, 'target');
    assert.equal(result.exitPrice, 1050);
    assert.equal(result.grossPnl, 1050 - 1000);
    assert.equal(result.daysHeld, 1);
  }
});

test('invalidation hit before target stops out', () => {
  const result = evaluateTrade(baseInput, [
    { date: '2026-09-25', open: 1005, high: 1010, low: 960, close: 980 },
  ]);
  assert.ok(result !== null);
  if (result) {
    assert.equal(result.exit, 'invalidation');
    assert.equal(result.exitPrice, 970);
    assert.ok(result.grossPnl < 0);
  }
});

test('time expiry exits at close of last day', () => {
  const result = evaluateTrade(baseInput, [
    { date: '2026-09-25', open: 1005, high: 1030, low: 990, close: 1010 },
    { date: '2026-09-26', open: 1010, high: 1030, low: 995, close: 1015 },
    { date: '2026-09-27', open: 1015, high: 1020, low: 1000, close: 1018 },
    { date: '2026-09-28', open: 1018, high: 1025, low: 1005, close: 1010 },
    { date: '2026-09-29', open: 1010, high: 1020, low: 1000, close: 1005 },
  ]);
  assert.ok(result !== null);
  if (result) {
    assert.equal(result.exit, 'expiry');
    assert.equal(result.exitPrice, 1005);
    assert.equal(result.daysHeld, 5);
  }
});

test('missing bars close the trade on last available bar', () => {
  const result = evaluateTrade(baseInput, [
    { date: '2026-09-25', open: 1005, high: 1020, low: 990, close: 1010 },
  ]);
  assert.ok(result !== null);
  if (result) {
    assert.equal(result.exit, 'expiry');
    assert.equal(result.exitPrice, 1010);
  }
});

test('net pnl applies the documented round-trip friction', () => {
  const result = evaluateTrade(baseInput, [
    { date: '2026-09-25', open: 1005, high: 1060, low: 990, close: 1040 },
  ]);
  assert.ok(result !== null);
  if (result) {
    assert.equal(result.grossPnl, 50);
    const friction = (1000 + 1050) * COST_RATE;
    assert.ok(Math.abs(result.netPnl - (50 - friction)) < 1e-9);
    assert.equal(result.costRate, COST_RATE);
  }
});

test('no bars is unscored, not an immediate 0R expiry', () => {
  assert.equal(evaluateTrade(baseInput, []), null);
});
