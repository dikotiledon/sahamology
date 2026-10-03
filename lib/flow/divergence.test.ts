import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDivergenceRegime, DivergenceInput } from './divergence';

test('detects WHALE_ABSORPTION when foreign institutional buying exceeds relative ADTV floor and retail sells', () => {
  const input: DivergenceInput = {
    adtv20d: 10_000_000_000, // 10B ADTV -> 10% is 1B floor
    foreignNetVal5d: 2_500_000_000, // > 1B
    retailNetVal5d: -1_800_000_000,
    domesticInstNetVal5d: 500_000_000,
    totalTurnover5d: 50_000_000_000,
  };
  const result = classifyDivergenceRegime(input);
  assert.equal(result.regime, 'WHALE_ABSORPTION');
  assert.equal(result.isBullishDivergence, true);
});

test('detects RETAIL_TRAP when retail buying dominates and whales dump', () => {
  const input: DivergenceInput = {
    adtv20d: 10_000_000_000,
    foreignNetVal5d: -2_000_000_000,
    retailNetVal5d: 3_000_000_000,
    domesticInstNetVal5d: -500_000_000,
    totalTurnover5d: 50_000_000_000,
  };
  const result = classifyDivergenceRegime(input);
  assert.equal(result.regime, 'RETAIL_TRAP');
  assert.equal(result.isBullishDivergence, false);
});

test('detects SYNCHRONIZED_ACCUMULATION when foreign and domestic institutions buy together and retail is negative', () => {
  const input: DivergenceInput = {
    adtv20d: 8_000_000_000,
    foreignNetVal5d: 1_200_000_000,
    domesticInstNetVal5d: 1_500_000_000,
    retailNetVal5d: -800_000_000,
    totalTurnover5d: 40_000_000_000,
  };
  const result = classifyDivergenceRegime(input);
  assert.equal(result.regime, 'SYNCHRONIZED_ACCUMULATION');
  assert.equal(result.isBullishDivergence, true);
});

test('enforces absolute IDR 500M floor for low turnover penny stocks', () => {
  const input: DivergenceInput = {
    adtv20d: 200_000_000, // 200M penny stock
    foreignNetVal5d: 30_000_000, // 30M is >10% of 200M, but below 500M floor
    retailNetVal5d: -30_000_000,
    domesticInstNetVal5d: 0,
    totalTurnover5d: 1_000_000_000,
  };
  const result = classifyDivergenceRegime(input);
  assert.equal(result.regime, 'INSUFFICIENT_LIQUIDITY');
  assert.equal(result.isBullishDivergence, false);
});

test('detects DOMESTIC_DRIVEN when foreign participation is under 5% of total turnover', () => {
  const input: DivergenceInput = {
    adtv20d: 10_000_000_000,
    foreignNetVal5d: 100_000_000, // tiny foreign
    retailNetVal5d: -1_500_000_000,
    domesticInstNetVal5d: 2_000_000_000,
    totalTurnover5d: 50_000_000_000,
    foreignGrossTurnover5d: 1_000_000_000, // 1B / 50B = 2% < 5%
  };
  const result = classifyDivergenceRegime(input);
  assert.equal(result.regime, 'DOMESTIC_DRIVEN');
});
