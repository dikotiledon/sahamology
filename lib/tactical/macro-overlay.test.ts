import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRupiahPressureIndex,
  evaluateMacroPressureState,
  applyMacroOverlayToBattlePlan,
  type BiRateDecision,
  type UsdIdrBar,
} from './macro-overlay';

test('calculateRupiahPressureIndex computes spot velocity and risk score accurately', () => {
  // Scenario 1: Stable Rupiah around 15,900
  const stableBars: UsdIdrBar[] = [
    { date: '2026-09-25', close: 15900 },
    { date: '2026-09-28', close: 15910 },
    { date: '2026-09-29', close: 15895 },
    { date: '2026-09-30', close: 15920 },
    { date: '2026-10-01', close: 15905 },
    { date: '2026-10-02', close: 15900 },
  ];
  const stableRpi = calculateRupiahPressureIndex(stableBars);
  assert.equal(stableRpi.velocity5dPct < 1.0, true);
  assert.equal(stableRpi.pressureScore < 50, true);
  assert.equal(stableRpi.isAboveCriticalThreshold, false);

  // Scenario 2: Rapid depreciation spiking through 16,600
  const depreciatingBars: UsdIdrBar[] = [
    { date: '2026-09-25', close: 16100 },
    { date: '2026-09-28', close: 16250 },
    { date: '2026-09-29', close: 16380 },
    { date: '2026-09-30', close: 16490 },
    { date: '2026-10-01', close: 16580 },
    { date: '2026-10-02', close: 16650 },
  ];
  const severeRpi = calculateRupiahPressureIndex(depreciatingBars);
  assert.equal(severeRpi.velocity5dPct > 3.0, true);
  assert.equal(severeRpi.pressureScore >= 70, true);
  assert.equal(severeRpi.isAboveCriticalThreshold, true);
});

test('evaluateMacroPressureState detects HEADWIND on rapid depreciation or rate hikes', () => {
  const severeRpi = {
    currentSpot: 16650,
    velocity5dPct: 3.4,
    velocity20dPct: 5.1,
    pressureScore: 85,
    isAboveCriticalThreshold: true,
  };

  const hikeDecision: BiRateDecision = {
    meetingDate: '2026-09-20',
    rate: 6.25,
    previousRate: 6.0,
    action: 'HIKE',
  };

  const state = evaluateMacroPressureState({
    rpi: severeRpi,
    latestBiDecision: hikeDecision,
  });

  assert.equal(state.regime, 'MACRO_HEADWIND');
  assert.equal(state.tightenInvalidationFactor, 0.85); // tightens stop zone
  assert.equal(state.volumeMultiplier, 1.33); // raises V15m threshold to 20%
});

test('evaluateMacroPressureState detects TAILWIND on strengthening Rupiah and rate cuts', () => {
  const tailwindRpi = {
    currentSpot: 15450,
    velocity5dPct: -1.2,
    velocity20dPct: -2.5,
    pressureScore: 20,
    isAboveCriticalThreshold: false,
  };

  const cutDecision: BiRateDecision = {
    meetingDate: '2026-09-20',
    rate: 5.75,
    previousRate: 6.0,
    action: 'CUT',
  };

  const state = evaluateMacroPressureState({
    rpi: tailwindRpi,
    latestBiDecision: cutDecision,
  });

  assert.equal(state.regime, 'MACRO_TAILWIND');
  assert.equal(state.volumeMultiplier, 1.0);
});

test('evaluateMacroPressureState fails open to MACRO_NEUTRAL on missing feeds', () => {
  const state = evaluateMacroPressureState({
    rpi: null,
    latestBiDecision: null,
  });

  assert.equal(state.regime, 'MACRO_NEUTRAL');
  assert.equal(state.tightenInvalidationFactor, 1.0);
  assert.equal(state.volumeMultiplier, 1.0);
});

test('applyMacroOverlayToBattlePlan adjusts V15m target and stop levels during HEADWIND', () => {
  const headwindState = {
    regime: 'MACRO_HEADWIND' as const,
    tightenInvalidationFactor: 0.85,
    volumeMultiplier: 1.33,
    summary: 'High FX volatility & monetary tightening',
  };

  const basePlan = {
    emiten: 'BBRI',
    entryPrice: 5000,
    invalidationPrice: 4800,
    targetR1: 5300,
    v15mTargetShares: 1500000,
  };

  const adjusted = applyMacroOverlayToBattlePlan(basePlan, headwindState);
  assert.equal(adjusted.macroRegime, 'MACRO_HEADWIND');
  // Invalidation distance is tightened: 5000 - (200 * 0.85) = 5000 - 170 = 4830
  assert.equal(adjusted.adjustedInvalidationPrice, 4830);
  // V15m target is raised: 1500000 * 1.33 = 1995000
  assert.equal(adjusted.adjustedV15mShares, 1995000);
});
