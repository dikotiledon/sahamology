import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scorePath, type PathBar } from './path-outcome';

const args = (over: Partial<Parameters<typeof scorePath>[0]> = {}) => ({
  entry: 1000,
  r1: 1050,
  max: 1100,
  invalidation: 970,
  costRate: 0.006,
  bars: [] as PathBar[],
  ...over,
});

test('stop is checked first when a bar prints through both levels', () => {
  const r = scorePath(
    args({ bars: [{ date: '2026-09-25', high: 1120, low: 950, close: 980 }] })
  );
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'invalidation');
    assert.equal(r.exitPrice, 970);
    assert.ok(r.rMultiple < 0);
  }
});

test('max is taken before r1', () => {
  const r = scorePath(
    args({ bars: [{ date: '2026-09-25', high: 1110, low: 990, close: 1090 }] })
  );
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'max');
    assert.equal(r.exitPrice, 1100);
  }
});

test('r1 is taken when max is not reached', () => {
  const r = scorePath(
    args({ bars: [{ date: '2026-09-25', high: 1060, low: 990, close: 1040 }] })
  );
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'r1');
    assert.equal(r.exitPrice, 1050);
  }
});

test('expiry exits at the last close', () => {
  const r = scorePath(
    args({
      bars: [
        { date: '2026-09-25', high: 1030, low: 990, close: 1010 },
        { date: '2026-09-26', high: 1020, low: 995, close: 1005 },
      ],
    })
  );
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    assert.equal(r.exit, 'expiry');
    assert.equal(r.exitPrice, 1005);
    assert.equal(r.daysHeld, 2);
  }
});

test('empty path is unscored, not a 0R win', () => {
  const r = scorePath(args({ bars: [] }));
  assert.equal(r.unscored, true);
});

test('non-positive risk is unscored', () => {
  const r = scorePath(
    args({
      invalidation: 1000,
      bars: [{ date: '2026-09-25', high: 1060, low: 990, close: 1040 }],
    })
  );
  assert.equal(r.unscored, true);
});

test('costs use the round-trip rate and R-multiple is after costs', () => {
  const r = scorePath(
    args({ bars: [{ date: '2026-09-25', high: 1060, low: 990, close: 1040 }] })
  );
  assert.equal(r.unscored, false);
  if (!r.unscored) {
    const risk = 1000 - 970;
    const expectedNet = 50 - (1000 + 1050) * 0.006;
    assert.ok(Math.abs(r.pnlAfterCosts - expectedNet) < 1e-9);
    assert.ok(Math.abs(r.rMultiple - expectedNet / risk) < 1e-9);
  }
});
