import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTapeSnapshot } from './snapshot';
import type { OhlcBar } from './ohlc';

function series(n: number, startClose = 100): OhlcBar[] {
  const bars: OhlcBar[] = [];
  let close = startClose;
  for (let i = 0; i < n; i += 1) {
    const day = String(i + 1).padStart(2, '0');
    bars.push({ date: `2026-09-${day}`, open: close, high: close + 2, low: close - 1, close: close + 1 });
    close += 1;
  }
  return bars;
}

const args = (over: Partial<Parameters<typeof buildTapeSnapshot>[0]> = {}) => ({
  bars: series(25),
  asOf: '2026-09-25',
  liveIncompleteToday: false,
  bandar: 120,
  todayBandar: 'CC',
  priorBandar: ['CC', 'AA'],
  ...over,
});

test('21+ bars yields a valid snapshot with a pattern-eligible trend', () => {
  const snap = buildTapeSnapshot(args());
  assert.equal(snap.ok, true);
  assert.ok(snap.atr !== null);
  assert.ok(snap.ema20 !== null);
  assert.ok(snap.ema20Prev !== null);
  assert.ok(snap.barsUsed >= 21);
});

test('fewer than 21 bars is not ok', () => {
  const snap = buildTapeSnapshot(args({ bars: series(15) }));
  assert.equal(snap.ok, false);
  assert.equal(snap.pattern, null);
});

test('future bar does not leak into the snapshot', () => {
  const truncated = args({ bars: series(25) });
  const poisoned: OhlcBar[] = [
    ...truncated.bars,
    { date: '2026-09-26', open: 1000, high: 5000, low: 1, close: 4000 },
  ];
  const a = buildTapeSnapshot(truncated);
  const b = buildTapeSnapshot({ ...truncated, bars: poisoned });
  assert.equal(a.atr, b.atr);
  assert.equal(a.ema20, b.ema20);
  assert.equal(a.ema20Prev, b.ema20Prev);
  assert.equal(a.pattern, b.pattern);
});

test('today bar is excluded when liveIncompleteToday is true', () => {
  const a = buildTapeSnapshot(args({ liveIncompleteToday: true }));
  const b = buildTapeSnapshot(args({ liveIncompleteToday: true, bars: series(25).filter((x) => x.date !== '2026-09-25') }));
  assert.equal(a.atr, b.atr);
  assert.equal(a.completedDate, '2026-09-24');
});
