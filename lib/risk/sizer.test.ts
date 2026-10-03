import test from 'node:test';
import assert from 'node:assert/strict';
import { getIdxTickSize, calculatePositionSize } from './sizer';

test('getIdxTickSize conforms to official IDX fraksi harga brackets', () => {
  assert.equal(getIdxTickSize(50), 1);
  assert.equal(getIdxTickSize(199), 1);
  assert.equal(getIdxTickSize(200), 2);
  assert.equal(getIdxTickSize(498), 2);
  assert.equal(getIdxTickSize(500), 5);
  assert.equal(getIdxTickSize(1995), 5);
  assert.equal(getIdxTickSize(2000), 10);
  assert.equal(getIdxTickSize(4990), 10);
  assert.equal(getIdxTickSize(5000), 25);
  assert.equal(getIdxTickSize(12000), 25);
});

test('calculatePositionSize accurately sizes lots with friction and 20% equity cap', () => {
  const result = calculatePositionSize({
    accountEquity: 100_000_000,
    riskPercentage: 1.0, // Rp 1,000,000 max risk
    plannedEntry: 2450,
    invalidationStop: 2330,
    buyFeePct: 0.15,
    sellFeePct: 0.25,
  });
  // Risk per share = (2450 - 2330) + (2450 * 0.0015) + (2330 * 0.0025) = 120 + 3.675 + 5.825 = 129.5
  // Max lots = floor(1,000,000 / (129.5 * 100)) = 77 lots
  assert.equal(result.recommendedLots, 77);
  assert.equal(result.allocatedCapital, 18_865_000);
  assert.ok(result.allocatedCapital <= 20_000_000, 'Must respect 20% capital cap');
  assert.ok(result.totalRiskAtStop <= 1_000_000, 'Must not exceed 1% risk');
  assert.equal(result.capitalCapReached, false);
});

test('calculatePositionSize caps lots when position size exceeds 20% portfolio equity cap', () => {
  // Very tight stop: entry 1000, stop 995 (0.5% risk)
  // Without cap, trader would buy 100M * 1% / 5 = large amount exceeding total equity
  const result = calculatePositionSize({
    accountEquity: 100_000_000,
    riskPercentage: 1.0,
    plannedEntry: 1000,
    invalidationStop: 995,
    maxCapitalPct: 20, // max 20M = 200 lots
  });
  assert.equal(result.capitalCapReached, true);
  assert.equal(result.recommendedLots, 200);
  assert.equal(result.allocatedCapital, 20_000_000);
});

test('calculatePositionSize handles invalid prices safely', () => {
  const result = calculatePositionSize({
    accountEquity: 100_000_000,
    riskPercentage: 1.0,
    plannedEntry: 1000,
    invalidationStop: 1050, // stop above entry
  });
  assert.equal(result.recommendedLots, 0);
  assert.equal(result.isValid, false);
});
