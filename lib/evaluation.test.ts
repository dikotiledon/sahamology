import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateTrade, TradeEvaluationInput, IDX_FRICTION } from './evaluation';

const baseInput: TradeEvaluationInput = {
  entryPrice: 1000,
  targetR1: 1050,
  invalidation: 970,
  horizonDays: 5,
};

test('target hit within horizon wins', () => {
  const result = evaluateTrade(baseInput, [
    { open: 1005, high: 1060, low: 990, close: 1040 },
  ]);
  assert.equal(result.exit, 'target');
  assert.equal(result.exitPrice, 1050);
  assert.equal(result.grossPnl, 1050 - 1000);
  assert.equal(result.daysHeld, 1);
});

test('invalidation hit before target stops out', () => {
  const result = evaluateTrade(baseInput, [
    { open: 1005, high: 1010, low: 960, close: 980 },
  ]);
  assert.equal(result.exit, 'invalidation');
  assert.equal(result.exitPrice, 970);
  assert.ok(result.grossPnl < 0);
});

test('time expiry exits at close of last day', () => {
  const result = evaluateTrade(baseInput, [
    { open: 1005, high: 1030, low: 990, close: 1010 },
    { open: 1010, high: 1030, low: 995, close: 1015 },
    { open: 1015, high: 1020, low: 1000, close: 1018 },
    { open: 1018, high: 1025, low: 1005, close: 1010 },
    { open: 1010, high: 1020, low: 1000, close: 1005 },
  ]);
  assert.equal(result.exit, 'expiry');
  assert.equal(result.exitPrice, 1005);
  assert.equal(result.daysHeld, 5);
});

test('missing bars close the trade on last available bar', () => {
  const result = evaluateTrade(baseInput, [
    { open: 1005, high: 1020, low: 990, close: 1010 },
  ]);
  assert.equal(result.exit, 'expiry');
  assert.equal(result.exitPrice, 1010);
});

test('net pnl applies round-trip friction', () => {
  const result = evaluateTrade(baseInput, [
    { open: 1005, high: 1060, low: 990, close: 1040 },
  ]);
  assert.equal(result.grossPnl, 50);
  const friction = (1000 + 1050) * IDX_FRICTION;
  assert.ok(Math.abs(result.netPnl - (50 - friction)) < 1e-9);
});

test('no bars is not an error but an immediate expiry at entry', () => {
  const result = evaluateTrade(baseInput, []);
  assert.equal(result.exit, 'expiry');
  assert.equal(result.exitPrice, 1000);
  assert.equal(result.netPnl, 0);
});
