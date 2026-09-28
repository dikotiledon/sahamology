import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atrWilder, trueRange } from './atr';
import type { OhlcBar } from './ohlc';

function bar(i: number, open: number, high: number, low: number, close: number): OhlcBar {
  return { date: `2026-01-${String(i).padStart(2, '0')}`, open, high, low, close };
}

test('trueRange uses high-low, prevClose-high, prevClose-low', () => {
  // prevClose 100; bar high 110 low 90 → TR = 20 (high-low largest)
  assert.equal(trueRange(100, { date: 'x', open: 105, high: 110, low: 90, close: 95 }), 20);
  // gap up: prevClose 100; high 120 low 115 → TR = |120-100| = 20
  assert.equal(trueRange(100, { date: 'x', open: 116, high: 120, low: 115, close: 118 }), 20);
  // gap down: prevClose 100; high 85 low 80 → TR = |80-100| = 20
  assert.equal(trueRange(100, { date: 'x', open: 84, high: 85, low: 80, close: 82 }), 20);
});

test('constant-range series seeds ATR at the average true range', () => {
  // 15 bars, each high-low = 10, no gaps → every TR = 10 → ATR seed = 10
  const bars: OhlcBar[] = [];
  let close = 100;
  for (let i = 0; i < 15; i += 1) {
    bars.push(bar(i, close, close + 10, close, close + 10));
    close += 10;
  }
  assert.equal(atrWilder(bars), 10);
});

test('gap-up bar raises true range above high-low', () => {
  // 14 flat bars TR=10, then a gap-up bar TR=20. Hand: seed = 10, then
  // ATR = 10*13/14 + 20/14 = (130+20)/14 = 150/14 = 10.714285714...
  const bars: OhlcBar[] = [];
  let close = 100;
  for (let i = 0; i < 14; i += 1) {
    bars.push(bar(i, close, close + 10, close, close + 10));
    close += 10;
  }
  // gap up: opens at prevClose+15; high=open+5 low=open close=open+5
  // TR = max(5, |open+5-240|, |open-240|) = max(5, 20, 15) = 20
  const open = close + 15;
  bars.push(bar(14, open, open + 5, open, open + 5));
  assert.ok(Math.abs(atrWilder(bars)! - 150 / 14) < 1e-9);
});

test('fourteen bars is not enough for ATR(14)', () => {
  const bars: OhlcBar[] = [];
  let close = 100;
  for (let i = 0; i < 14; i += 1) {
    bars.push(bar(i, close, close + 10, close, close + 10));
    close += 10;
  }
  assert.equal(atrWilder(bars), null);
});

test('non-finite input returns null', () => {
  const bars: OhlcBar[] = [];
  let close = 100;
  for (let i = 0; i < 15; i += 1) {
    bars.push(bar(i, close, close + 10, close, close + 10));
    close += 10;
  }
  bars[7].close = Number.NaN;
  assert.equal(atrWilder(bars), null);
});
