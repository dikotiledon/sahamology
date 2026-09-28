import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectPatterns } from './patterns';
import type { OhlcBar } from './ohlc';

const bar = (over: Partial<OhlcBar>): OhlcBar => ({
  date: '2026-09-24',
  open: 100,
  high: 110,
  low: 99,
  close: 105,
  ...over,
});

const base = {
  bar: bar({ open: 100, high: 105, low: 99, close: 100 }),
  prev: bar({ open: 98, high: 102, low: 97, close: 99 }),
  bandar: 100,
  atr: 5,
  ema20: 102,
  sameBandarStreak: false,
};

test('spring: low at/below bandar but within 1xATR, close back at bandar', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ low: 97.5, close: 100 }),
  });
  assert.equal(r.spring, true);
  assert.equal(r.name, 'spring');
});

test('spring: too deep below bandar is not a spring', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ low: 92, close: 100 }), // bandar - 1.5*atr = 92.5
  });
  assert.equal(r.spring, false);
});

test('spring: close still below bandar is not a spring', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ low: 98, close: 99 }),
  });
  assert.equal(r.spring, false);
});

test('higher-low requires a same-bandar streak', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ low: 100, close: 101 }),
    prev: bar({ low: 99, close: 99 }),
    bandar: 90, // keep spring off: low stays above bandar
    sameBandarStreak: true,
  });
  assert.equal(r.higherLow, true);
  assert.equal(r.name, 'higher_low');
});

test('higher-low without the streak is not a pattern', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ low: 100 }),
    prev: bar({ low: 99 }),
    bandar: 90,
    sameBandarStreak: false,
  });
  assert.equal(r.higherLow, false);
  assert.equal(r.name, null);
});

test('P3: close above prior high and at/above EMA is the breakout', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ close: 103, high: 104 }),
    prev: bar({ high: 101 }),
    bandar: 95, // keep spring off: low 99 stays above bandar
    ema20: 102,
  });
  assert.equal(r.breakPriorHigh, true);
  assert.equal(r.name, 'break_prior_high');
});

test('P3: close above prior high but below EMA is rejected', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ close: 103, high: 104 }),
    prev: bar({ high: 101 }),
    bandar: 95,
    ema20: 104,
  });
  assert.equal(r.breakPriorHigh, false);
  assert.equal(r.name, null);
});

test('P3: wick above prior high with close still below is rejected', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ close: 100, high: 103 }),
    prev: bar({ high: 101 }),
    ema20: 99,
  });
  assert.equal(r.breakPriorHigh, false);
});

test('no pattern matches returns null name', () => {
  const r = detectPatterns({
    ...base,
    bar: bar({ low: 96, close: 99 }),
    ema20: 104,
  });
  assert.equal(r.spring, false);
  assert.equal(r.higherLow, false);
  assert.equal(r.breakPriorHigh, false);
  assert.equal(r.name, null);
});
