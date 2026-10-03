import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBarSpread, calculateClosePosition, calculateVsaMetrics } from './vsa';
import type { WyckoffBar } from './types';

test('calculateBarSpread returns high - low', () => {
  const bar: WyckoffBar = { date: '2026-10-01', open: 5000, high: 5200, low: 4950, close: 5150, volume: 1000000 };
  assert.equal(calculateBarSpread(bar), 250);
});

test('calculateClosePosition normalizes close location within bar [0, 1]', () => {
  const hammer: WyckoffBar = { date: '2026-10-01', open: 5100, high: 5200, low: 4800, close: 5150, volume: 1000000 };
  // (5150 - 4800) / (5200 - 4800) = 350 / 400 = 0.875
  assert.equal(calculateClosePosition(hammer), 0.875);

  const flatBar: WyckoffBar = { date: '2026-10-01', open: 5000, high: 5000, low: 5000, close: 5000, volume: 0 };
  assert.equal(calculateClosePosition(flatBar), 0.5);
});

test('calculateVsaMetrics computes moving averages and relative spread/volume ratios', () => {
  // Generate 25 baseline bars
  const bars: WyckoffBar[] = [];
  for (let i = 0; i < 25; i++) {
    bars.push({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      open: 5000,
      high: 5100, // spread = 200
      low: 4900,
      close: 5050,
      volume: 1000000,
    });
  }

  // Bar 25 has huge volume (3M) and wide spread (500)
  bars.push({
    date: '2026-09-26',
    open: 4800,
    high: 5300, // spread = 500
    low: 4800,
    close: 5250, // closePosition = (5250 - 4800) / 500 = 0.9
    volume: 3000000, // 3x volume
  });

  const metrics = calculateVsaMetrics(bars, bars.length - 1);
  assert.equal(metrics.spread, 500);
  assert.equal(metrics.closePosition, 0.9);
  assert.ok(metrics.relativeSpread > 2.0);
  assert.ok(metrics.isWideSpread);
  assert.ok(metrics.relativeVolume >= 2.5);
  assert.ok(metrics.isUltraHighVolume);
  assert.equal(metrics.isLowVolume, false);
});
