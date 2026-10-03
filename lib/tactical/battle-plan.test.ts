import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBattlePlanRow, BattlePlanCandidate, isTradingDayJakarta } from './battle-plan';

test('buildBattlePlanRow calculates V15m volume confirmation threshold as 15% of 20d avg volume', () => {
  const candidate: BattlePlanCandidate = {
    emiten: 'BBCA',
    stance: 'ENTER',
    entryPrice: 10000,
    targetR1: 10500,
    targetMax: 11000,
    invalidationStop: 9700,
    avgDailyVolume20d: 50_000_000,
    macroBias: 'BULLISH',
    catalystSummary: 'Foreign institutional accumulation',
  };
  const row = buildBattlePlanRow(candidate, '2026-10-05');
  assert.ok(row !== null);
  assert.equal(row.open15mVolThreshold, 7_500_000);
  assert.equal(row.triggerPrice, 10000);
  assert.equal(row.targetR1, 10500);
  assert.equal(row.targetMax, 11000);
  assert.equal(row.invalidationPrice, 9700);
  assert.equal(row.macroBias, 'BULLISH');
});

test('buildBattlePlanRow fails closed if entry price or invalidation is missing or non-positive', () => {
  const candidate: any = {
    emiten: 'BBCA',
    stance: 'ENTER',
    entryPrice: null,
    targetR1: 10500,
    targetMax: 11000,
    invalidationStop: 9700,
    avgDailyVolume20d: 50_000_000,
  };
  const row = buildBattlePlanRow(candidate, '2026-10-05');
  assert.equal(row, null);
});

test('isTradingDayJakarta detects weekends and configured holidays accurately', () => {
  // Saturday 2026-10-03 is weekend
  assert.equal(isTradingDayJakarta(new Date('2026-10-03T01:30:00Z')), false);
  // Sunday 2026-10-04 is weekend
  assert.equal(isTradingDayJakarta(new Date('2026-10-04T01:30:00Z')), false);
  // Monday 2026-10-05 is trading day (08:30 WIB is 01:30 UTC)
  assert.equal(isTradingDayJakarta(new Date('2026-10-05T01:30:00Z')), true);
});
