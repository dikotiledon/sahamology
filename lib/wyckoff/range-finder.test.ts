import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTradingRange } from './range-finder';
import type { WyckoffBar } from './types';

function createConsolidationBars(count: number, low = 4800, high = 5400): WyckoffBar[] {
  const bars: WyckoffBar[] = [];
  for (let i = 0; i < count; i++) {
    // Oscillate between 4850 and 5350
    const phase = i % 4;
    let bLow = low + 50;
    let bHigh = high - 50;
    let close = 5100;

    if (phase === 0) {
      bLow = low; // Touches ICE
      close = low + 100;
    } else if (phase === 2) {
      bHigh = high; // Touches CREEK
      close = high - 100;
    }

    bars.push({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      open: 5100,
      high: bHigh,
      low: bLow,
      close,
      volume: 1000000,
    });
  }
  return bars;
}

test('detectTradingRange returns null when bars < 25', () => {
  const bars = createConsolidationBars(20);
  const tr = detectTradingRange(bars);
  assert.equal(tr, null);
});

test('detectTradingRange identifies valid active trading range with Ice and Creek', () => {
  const bars = createConsolidationBars(35, 4800, 5400);
  const tr = detectTradingRange(bars);

  assert.ok(tr !== null);
  assert.equal(tr.iceSupport, 4800);
  assert.equal(tr.creekResistance, 5400);
  assert.equal(tr.midpoint, 5100);
  assert.equal(tr.status, 'ACTIVE');
  assert.ok(tr.rangeWidthPct > 10 && tr.rangeWidthPct < 15); // (5400 - 4800) / 4800 = 12.5%
  assert.equal(tr.barCount, 35);
});

test('detectTradingRange flags BROKEN_OUT_UP when latest close expands above Creek', () => {
  const bars = createConsolidationBars(30, 4800, 5400);
  // Add breakout bar
  bars.push({
    date: '2026-09-05',
    open: 5350,
    high: 5600,
    low: 5300,
    close: 5580, // > 5400 * 1.02 (5508)
    volume: 3500000,
  });

  const tr = detectTradingRange(bars);
  assert.ok(tr !== null);
  assert.equal(tr.status, 'BROKEN_OUT_UP');
});
