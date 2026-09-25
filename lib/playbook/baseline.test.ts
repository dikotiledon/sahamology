import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAdiOnly, type BaselineTrade } from './baseline';
import { defaultCostModel } from './costs';

const costs = defaultCostModel();

test('next-day winner hits both targets', () => {
  const trades: BaselineTrade[] = [
    {
      emiten: 'BBRI',
      signalDate: '2026-09-24',
      entry: 1000,
      r1: 1050,
      max: 1100,
      invalidation: 970,
      nextDayHigh: 1060,
      path: [{ date: '2026-09-25', high: 1060, low: 990 }],
    },
  ];
  const report = evaluateAdiOnly(trades, costs);
  assert.equal(report.sampleSize, 1);
  assert.equal(report.nextDayHitR1, 1);
  assert.equal(report.nextDayHitMax, 0);
  assert.ok(report.expectancyR !== null);
  assert.ok((report.expectancyR as number) > 0);
});

test('invalidation on day 2 loses', () => {
  const trades: BaselineTrade[] = [
    {
      emiten: 'BBRI',
      signalDate: '2026-09-24',
      entry: 1000,
      r1: 1050,
      max: 1100,
      invalidation: 970,
      nextDayHigh: 1010,
      path: [
        { date: '2026-09-25', high: 1010, low: 990 },
        { date: '2026-09-26', high: 1000, low: 960 },
      ],
    },
  ];
  const report = evaluateAdiOnly(trades, costs);
  assert.equal(report.nextDayHitR1, 0);
  assert.ok((report.expectancyR as number) < 0);
});

test('costs reduce R on the winner', () => {
  const free = evaluateAdiOnly(
    [
      {
        emiten: 'BBRI',
        signalDate: '2026-09-24',
        entry: 1000,
        r1: 1050,
        max: 1100,
        invalidation: 970,
        nextDayHigh: 1060,
        path: [{ date: '2026-09-25', high: 1060, low: 990 }],
      },
    ],
    { buyFeeRate: 0, sellFeeRate: 0, spreadHaircutRate: 0 }
  );
  const paid = evaluateAdiOnly(
    [
      {
        emiten: 'BBRI',
        signalDate: '2026-09-24',
        entry: 1000,
        r1: 1050,
        max: 1100,
        invalidation: 970,
        nextDayHigh: 1060,
        path: [{ date: '2026-09-25', high: 1060, low: 990 }],
      },
    ],
    costs
  );
  assert.ok((paid.expectancyR as number) < (free.expectancyR as number));
});

test('empty sample reports zero with null expectancy', () => {
  const report = evaluateAdiOnly([], costs);
  assert.equal(report.sampleSize, 0);
  assert.equal(report.expectancyR, null);
  assert.equal(report.profitFactor, null);
});

test('no path data still reports next-day hit', () => {
  const report = evaluateAdiOnly(
    [
      {
        emiten: 'BBRI',
        signalDate: '2026-09-24',
        entry: 1000,
        r1: 1050,
        max: 1100,
        invalidation: 970,
        nextDayHigh: 1060,
      },
    ],
    costs
  );
  assert.equal(report.nextDayHitR1, 1);
  assert.equal(report.expectancyR, null);
});
