import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWyckoffStructure } from './classifier';
import type { WyckoffBar } from './types';

function createConsolidationBars(count: number, low = 4800, high = 5400): WyckoffBar[] {
  const bars: WyckoffBar[] = [];
  for (let i = 0; i < count; i++) {
    const phase = i % 4;
    let bLow = low + 50;
    let bHigh = high - 50;
    let close = 5100;

    if (phase === 0) {
      bLow = low;
      close = low + 100;
    } else if (phase === 2) {
      bHigh = high;
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

test('classifyWyckoffStructure returns WYCKOFF_UNCLASSIFIED on sparse bars (< 25)', () => {
  const bars = createConsolidationBars(15);
  const res = classifyWyckoffStructure({ emiten: 'BBRI', bars });
  assert.equal(res.phase, 'WYCKOFF_UNCLASSIFIED');
  assert.equal(res.confidenceScore, 0);
  assert.equal(res.tradingRange, null);
});

test('classifyWyckoffStructure classifies PHASE_B_ABSORPTION during sideways range bound consolidation', () => {
  const bars = createConsolidationBars(35, 4800, 5400);
  const res = classifyWyckoffStructure({
    emiten: 'BBRI',
    bars,
    aqsScores: { '2026-08-35': 75 },
  });

  assert.equal(res.phase, 'PHASE_B_ABSORPTION');
  assert.ok(res.confidenceScore >= 60);
  assert.ok(res.tradingRange !== null);
  assert.equal(res.tradingRange?.iceSupport, 4800);
  assert.equal(res.tradingRange?.creekResistance, 5400);
  assert.ok(res.confluenceTags.includes('HIGH_INSTITUTIONAL_ABSORPTION'));
});

test('classifyWyckoffStructure classifies PHASE_C_SPRING when spring occurs within last 5 bars', () => {
  const bars = createConsolidationBars(30, 4800, 5400);
  // Add Spring bar
  bars.push({
    date: '2026-09-01',
    open: 4850,
    high: 4950,
    low: 4720, // Breached 4800
    close: 4890, // Recovered inside range
    volume: 750000,
  });

  const res = classifyWyckoffStructure({
    emiten: 'BBRI',
    bars,
    aqsScores: { '2026-09-01': 80 },
  });

  assert.equal(res.phase, 'PHASE_C_SPRING');
  assert.equal(res.springDetected, true);
  assert.equal(res.springLow, 4720);
  assert.ok(res.markupReadinessScore >= 80);
  assert.ok(res.confluenceTags.includes('SPRING_SUPPLY_TEST_CONFIRMED'));
});

test('classifyWyckoffStructure classifies PHASE_E_MARKUP when closing cleanly above Creek', () => {
  const bars = createConsolidationBars(30, 4800, 5400);
  // Add breakout bar
  bars.push({
    date: '2026-09-01',
    open: 5350,
    high: 5650,
    low: 5350,
    close: 5600, // > 5400 * 1.02
    volume: 3500000,
  });

  const res = classifyWyckoffStructure({
    emiten: 'BBRI',
    bars,
  });

  assert.equal(res.phase, 'PHASE_E_MARKUP');
  assert.ok(res.markupReadinessScore >= 90);
  assert.ok(res.confluenceTags.includes('CREEK_BREAKOUT'));
});
