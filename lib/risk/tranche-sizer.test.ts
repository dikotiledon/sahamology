import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTrancheSchedule,
  type TrancheSizerInput,
} from './tranche-sizer';

test('calculateTrancheSchedule decomposes large lot orders into 3 execution tranches with exact integer sum', () => {
  const input: TrancheSizerInput = {
    totalLots: 1250,
    entryPrice: 5000,
    adtvShares: 20000000, // 200,000 lots
    avgQueueDepthLots: 3000,
  };

  const schedule = calculateTrancheSchedule(input);
  assert.equal(schedule.totalLots, 1250);
  assert.equal(schedule.tranches.length, 3);

  // Verify integer lots sum up exactly to totalLots
  const sumLots = schedule.tranches.reduce((acc, t) => acc + t.lotSize, 0);
  assert.equal(sumLots, 1250);

  // Check tranche identities and percentages
  assert.equal(schedule.tranches[0].name, 'TRANCHE_1_OPENING');
  assert.equal(schedule.tranches[0].targetSession, '09:00 - 09:15 WIB (V15m)');
  assert.equal(schedule.tranches[1].name, 'TRANCHE_2_PULLBACK');
  assert.equal(schedule.tranches[1].targetSession, '10:00 - 14:30 WIB (Continuous)');
  assert.equal(schedule.tranches[2].name, 'TRANCHE_3_PRECLOSING');
  assert.equal(schedule.tranches[2].targetSession, '15:50 - 16:00 WIB (Pre-closing)');
});

test('calculateTrancheSchedule caps single tranche size below 10% queue depth and flags market impact risk', () => {
  // Thin stock: queue depth only 200 lots, order wants 1000 lots
  const input: TrancheSizerInput = {
    totalLots: 1000,
    entryPrice: 1200,
    adtvShares: 500000, // 5,000 lots
    avgQueueDepthLots: 200,
  };

  const schedule = calculateTrancheSchedule(input);
  assert.equal(schedule.marketImpactAlert, 'HIGH_MARKET_IMPACT');
  assert.equal(schedule.estimatedTotalSlippageTicks >= 2, true);
  // Suggests splitting further or using TWAP
  assert.equal(schedule.recommendedExecutionMethod, 'TIME_WEIGHTED_TWAP');
});

test('calculateTrancheSchedule handles small lot orders (< 100 lots) with single unified tranche', () => {
  const input: TrancheSizerInput = {
    totalLots: 45,
    entryPrice: 8500,
    adtvShares: 15000000,
    avgQueueDepthLots: 5000,
  };

  const schedule = calculateTrancheSchedule(input);
  assert.equal(schedule.totalLots, 45);
  assert.equal(schedule.tranches.length, 1);
  assert.equal(schedule.tranches[0].lotSize, 45);
  assert.equal(schedule.marketImpactAlert, 'NEGLIGIBLE_IMPACT');
  assert.equal(schedule.recommendedExecutionMethod, 'SINGLE_BLOCK_ORDER');
});

test('calculateTrancheSchedule enforces IDX 50,000 lot exchange single-order ceiling', () => {
  const input: TrancheSizerInput = {
    totalLots: 120000, // huge whale order
    entryPrice: 400,
    adtvShares: 500000000, // 5M lots
    avgQueueDepthLots: 100000,
  };

  const schedule = calculateTrancheSchedule(input);
  for (const tranche of schedule.tranches) {
    assert.equal(tranche.lotSize <= 50000, true);
  }
});
