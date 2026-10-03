import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectSellingClimax,
  detectSpring,
  detectSignOfStrength,
  detectUpthrust,
  detectStructuralEvents,
} from './event-detector';
import { calculateVsaMetrics } from './vsa';
import type { WyckoffBar, TradingRange } from './types';

const defaultRange: TradingRange = {
  startDate: '2026-08-01',
  endDate: '2026-09-01',
  iceSupport: 4800,
  creekResistance: 5400,
  midpoint: 5100,
  rangeWidthPct: 12.5,
  barCount: 30,
  status: 'ACTIVE',
};

function generateBaseBars(count: number): WyckoffBar[] {
  const bars: WyckoffBar[] = [];
  for (let i = 0; i < count; i++) {
    bars.push({
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      open: 5000,
      high: 5100,
      low: 4900,
      close: 5000,
      volume: 1000000,
    });
  }
  return bars;
}

test('detectSellingClimax identifies climax bar with high volume and absorption off low', () => {
  const bars = generateBaseBars(20);
  const scBar: WyckoffBar = {
    date: '2026-08-21',
    open: 4900,
    high: 4950,
    low: 4500, // sharp new low
    close: 4850, // closed well off the low: (4850 - 4500) / 450 = 0.77
    volume: 3000000, // 3x volume
  };
  bars.push(scBar);
  const vsa = calculateVsaMetrics(bars, bars.length - 1);

  const event = detectSellingClimax(bars, bars.length - 1, vsa);
  assert.ok(event !== null);
  assert.equal(event?.type, 'SELLING_CLIMAX');
  assert.equal(event?.price, 4500);
});

test('detectSpring identifies spring dip below Ice and close back inside range', () => {
  const bars = generateBaseBars(20);
  const springBar: WyckoffBar = {
    date: '2026-08-21',
    open: 4850,
    high: 4950,
    low: 4700, // Dips below iceSupport (4800)
    close: 4880, // Closes back inside range (> 4800)
    volume: 800000, // Low volume test
  };
  bars.push(springBar);
  const vsa = calculateVsaMetrics(bars, bars.length - 1);

  const event = detectSpring(bars, bars.length - 1, defaultRange, vsa, 70);
  assert.ok(event !== null);
  assert.equal(event?.type, 'SPRING');
  assert.equal(event?.price, 4700);
});

test('detectSignOfStrength identifies high volume breakout towards Creek', () => {
  const bars = generateBaseBars(20);
  const sosBar: WyckoffBar = {
    date: '2026-08-21',
    open: 5050,
    high: 5380,
    low: 5000,
    close: 5350, // Closes near top: (5350 - 5000) / 380 = 0.92
    volume: 2400000, // Expanding volume
  };
  bars.push(sosBar);
  const vsa = calculateVsaMetrics(bars, bars.length - 1);

  const event = detectSignOfStrength(bars, bars.length - 1, defaultRange, vsa);
  assert.ok(event !== null);
  assert.equal(event?.type, 'SIGN_OF_STRENGTH');
  assert.equal(event?.price, 5350);
});

test('detectUpthrust identifies failed breakout above Creek closing back inside', () => {
  const bars = generateBaseBars(20);
  const utBar: WyckoffBar = {
    date: '2026-08-21',
    open: 5350,
    high: 5550, // Pierces Creek (5400)
    low: 5300,
    close: 5340, // Falls back below Creek with low close position
    volume: 2200000,
  };
  bars.push(utBar);
  const vsa = calculateVsaMetrics(bars, bars.length - 1);

  const event = detectUpthrust(bars, bars.length - 1, defaultRange, vsa);
  assert.ok(event !== null);
  assert.equal(event?.type, 'UPTHRUST');
});

test('detectStructuralEvents aggregates historical events for the range', () => {
  const bars = generateBaseBars(25);
  // Add an SC earlier and Spring recently
  bars[5] = { date: '2026-08-06', open: 4900, high: 4950, low: 4500, close: 4850, volume: 3000000 };
  bars[20] = { date: '2026-08-21', open: 4850, high: 4950, low: 4720, close: 4890, volume: 750000 };

  const events = detectStructuralEvents(bars, defaultRange);
  assert.ok(events.length >= 2);
  const types = events.map((e: { type: string }) => e.type);
  assert.ok(types.includes('SELLING_CLIMAX'));
  assert.ok(types.includes('SPRING'));
});
