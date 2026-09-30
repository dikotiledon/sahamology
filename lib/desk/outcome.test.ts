import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreJournalPath } from './outcome';
import { horizonSessions } from '../playbook/walk-forward';
import { roundTripCostRate, defaultCostModel } from '../playbook/costs';

const asOf = '2026-01-05';
const sessions = horizonSessions(asOf, 5);

function bars(n: number, over: { high?: number; low?: number; close?: number } = {}) {
  return sessions.slice(0, n).map((date) => ({
    date,
    high: over.high ?? 1030,
    low: over.low ?? 990,
    close: over.close ?? 1010,
  }));
}

const base = {
  stance: 'ENTER' as const,
  asOf,
  entry: 1000,
  r1: 1050,
  max: 1100,
  invalidation: 970,
};

test('ENTER plus five complete bars scores a PathExit', () => {
  const r = scoreJournalPath({ ...base, bars: bars(5, { high: 1060, low: 990, close: 1040 }) });
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'r1');
    assert.equal(r.exitPrice, 1050);
    assert.equal(typeof r.rMultiple, 'number');
  }
});

test('invalidation is taken first on a through-bar', () => {
  const r = scoreJournalPath({ ...base, bars: bars(5, { high: 1120, low: 950, close: 980 }) });
  assert.equal(r.unscored, false);
  if (!r.unscored) assert.equal(r.exit, 'invalidation');
});

test('max is taken before r1', () => {
  const r = scoreJournalPath({ ...base, bars: bars(5, { high: 1110, low: 990, close: 1090 }) });
  assert.equal(r.unscored, false);
  if (!r.unscored) assert.equal(r.exit, 'max');
});

test('expiry exits at the last close when no barrier is touched', () => {
  const r = scoreJournalPath({ ...base, bars: bars(5) });
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'expiry');
    assert.equal(r.exitPrice, 1010);
  }
});

test('one bar is incomplete and stays unscored', () => {
  const r = scoreJournalPath({ ...base, bars: bars(1, { high: 1060, low: 990, close: 1040 }) });
  assert.equal(r.unscored, true);
});

test('bars after the N=5 horizon cannot change the PathExit', () => {
  const extra = horizonSessions(asOf, 6)[5];
  const r = scoreJournalPath({
    ...base,
    bars: [
      ...bars(5),
      { date: extra, high: 1120, low: 990, close: 1110 },
    ],
  });
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'expiry');
    assert.equal(r.exitPrice, 1010);
    assert.equal(r.daysHeld, 5);
  }
});

test('a malformed bar after the N=5 horizon cannot unscore a complete path', () => {
  const extra = horizonSessions(asOf, 6)[5];
  const r = scoreJournalPath({
    ...base,
    bars: [
      ...bars(5),
      { date: extra, high: 'nope', low: 990, close: 1110 },
    ],
  });
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'expiry');
    assert.equal(r.exitPrice, 1010);
    assert.equal(r.daysHeld, 5);
  }
});

test('out-of-order bars are scored in session order, not input order', () => {
  const [day1, day2, day3, day4, day5] = sessions;
  const r = scoreJournalPath({
    ...base,
    bars: [
      { date: day5, high: 1120, low: 990, close: 1110 },
      { date: day1, high: 1030, low: 950, close: 980 },
      { date: day2, high: 1030, low: 990, close: 1010 },
      { date: day3, high: 1030, low: 990, close: 1010 },
      { date: day4, high: 1030, low: 990, close: 1010 },
    ],
  });
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'invalidation');
    assert.equal(r.exitPrice, 970);
    assert.equal(r.daysHeld, 1);
  }
});

test('WAIT is ineligible even with a complete horizon', () => {
  const r = scoreJournalPath({ ...base, stance: 'WAIT', bars: bars(5, { high: 1060 }) });
  assert.equal(r.unscored, true);
});

test('AVOID is ineligible', () => {
  const r = scoreJournalPath({ ...base, stance: 'AVOID', bars: bars(5) });
  assert.equal(r.unscored, true);
});

test('non-positive risk stays unscored', () => {
  const r = scoreJournalPath({ ...base, invalidation: 1000, bars: bars(5, { high: 1060 }) });
  assert.equal(r.unscored, true);
});

test('string NUMERIC high/low cannot false-stop after coerce', () => {
  const r = scoreJournalPath({
    ...base,
    bars: sessions.map((date) => ({
      date,
      high: '1100' as unknown as number,
      low: '980' as unknown as number,
      close: '1040' as unknown as number,
    })),
  });
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'max');
    assert.equal(r.exitPrice, 1100);
  }
});

test('cost rate is the canonical round-trip, not a hardcoded 0.006', () => {
  const r = scoreJournalPath({ ...base, bars: bars(5, { high: 1060, low: 990, close: 1040 }) });
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    const rate = roundTripCostRate(defaultCostModel());
    const risk = 1000 - 970;
    const expectedNet = 50 - (1000 + 1050) * rate;
    assert.ok(Math.abs(r.rMultiple - expectedNet / risk) < 1e-9);
  }
});
