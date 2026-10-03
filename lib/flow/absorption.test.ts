import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAbsorptionScore, AbsorptionInput } from './absorption';

test('calculateAbsorptionScore detects HEAVY_ABSORPTION when top 3 buyers absorb into flat price', () => {
  const input: AbsorptionInput = {
    top3Concentration5d: 0.65,
    netValue1d: 5_000_000_000,
    netValue3d: 12_000_000_000,
    netValue5d: 25_000_000_000,
    priceReturn5dPct: -1.5, // flat/consolidating stealth accumulation
    barsCount: 20,
  };
  const result = calculateAbsorptionScore(input);
  assert.ok(result.score >= 75, `Expected score >= 75, got ${result.score}`);
  assert.equal(result.tag, 'HEAVY_ABSORPTION');
  assert.equal(result.historyStatus, 'COMPLETE');
});

test('calculateAbsorptionScore detects MODERATE_ABSORPTION on standard markup', () => {
  const input: AbsorptionInput = {
    top3Concentration5d: 0.45, // 20 pts
    netValue1d: 2_000_000_000,
    netValue3d: 5_000_000_000,
    netValue5d: 8_000_000_000, // 30 pts persistence
    priceReturn5dPct: 5.0, // standard markup -> 25 pts divergence
    barsCount: 20,
  };
  const result = calculateAbsorptionScore(input);
  // Total = 20 + 30 + 25 = 75
  assert.ok(result.score >= 60 && result.score <= 75);
});

test('calculateAbsorptionScore detects DISTRIBUTION when whales dump into declining price', () => {
  const input: AbsorptionInput = {
    top3Concentration5d: 0.20,
    netValue1d: -3_000_000_000,
    netValue3d: -7_000_000_000,
    netValue5d: -15_000_000_000,
    priceReturn5dPct: -6.0,
    barsCount: 20,
  };
  const result = calculateAbsorptionScore(input);
  assert.ok(result.score < 40, `Expected score < 40, got ${result.score}`);
  assert.equal(result.tag, 'DISTRIBUTION');
});

test('calculateAbsorptionScore handles sparse historical bars gracefully (<5 bars)', () => {
  const input: AbsorptionInput = {
    top3Concentration5d: 0.40,
    netValue1d: 1_000_000_000,
    netValue3d: 1_000_000_000,
    netValue5d: 1_000_000_000,
    priceReturn5dPct: 0.5,
    barsCount: 3,
  };
  const result = calculateAbsorptionScore(input);
  assert.equal(result.historyStatus, 'INCOMPLETE_HISTORY');
});
