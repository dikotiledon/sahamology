import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SmcPriceBar,
  detectSwingPoints,
  detectBreaksOfStructure,
  detectOrderBlocks,
  detectFairValueGaps,
  detectLiquiditySweeps,
  evaluateSmcConfluence,
  evaluateSmartMoneyStructure,
} from './index';

test('detectSwingPoints accurately identifies swing highs and swing lows', () => {
  // Construct a 9-bar sequence with a peak at bar 4 and trough at bar 7
  const bars: SmcPriceBar[] = [
    { date: '2026-09-01', open: 5000, high: 5050, low: 4980, close: 5020, volume: 1000 },
    { date: '2026-09-02', open: 5020, high: 5100, low: 5010, close: 5080, volume: 1000 },
    { date: '2026-09-03', open: 5080, high: 5180, low: 5060, close: 5150, volume: 1200 },
    { date: '2026-09-04', open: 5150, high: 5200, low: 5120, close: 5180, volume: 1500 },
    { date: '2026-09-05', open: 5180, high: 5350, low: 5170, close: 5300, volume: 2500 }, // Swing High (index 4)
    { date: '2026-09-08', open: 5300, high: 5250, low: 5100, close: 5120, volume: 1200 },
    { date: '2026-09-09', open: 5120, high: 5150, low: 5000, close: 5020, volume: 1100 },
    { date: '2026-09-10', open: 5020, high: 5050, low: 4850, close: 4900, volume: 1800 }, // Swing Low (index 7)
    { date: '2026-09-11', open: 4900, high: 5000, low: 4890, close: 4980, volume: 1400 },
    { date: '2026-09-12', open: 4980, high: 5080, low: 4950, close: 5050, volume: 1300 },
  ];

  const swings = detectSwingPoints(bars, 2);
  assert.ok(swings.length >= 2, `Expected at least 2 swings, got ${swings.length}`);

  const highSwing = swings.find((s) => s.type === 'HIGH' && s.price === 5350);
  assert.ok(highSwing, 'Should identify swing high at 5350');
  assert.equal(highSwing.index, 4);

  const lowSwing = swings.find((s) => s.type === 'LOW' && s.price === 4850);
  assert.ok(lowSwing, 'Should identify swing low at 4850');
  assert.equal(lowSwing.index, 7);
});

test('detectBreaksOfStructure detects BOS and CHoCH on structural breaks', () => {
  const bars: SmcPriceBar[] = [
    { date: '2026-09-01', open: 5000, high: 5050, low: 4950, close: 5000, volume: 1000 },
    { date: '2026-09-02', open: 5000, high: 5150, low: 4980, close: 5120, volume: 1000 },
    { date: '2026-09-03', open: 5120, high: 5250, low: 5100, close: 5220, volume: 1200 }, // High 5250
    { date: '2026-09-04', open: 5220, high: 5200, low: 5050, close: 5100, volume: 1000 },
    { date: '2026-09-05', open: 5100, high: 5150, low: 5020, close: 5050, volume: 1000 },
    { date: '2026-09-08', open: 5050, high: 5350, low: 5040, close: 5320, volume: 2500 }, // Break above 5250
  ];

  const swings = detectSwingPoints(bars, 1);
  const { breaks, marketStructure } = detectBreaksOfStructure(bars, swings);

  assert.ok(breaks.length >= 1, 'Should register at least 1 structure break');
  assert.equal(breaks[0].direction, 'BULLISH');
  assert.equal(marketStructure, 'BULLISH_EXPANSION');
  assert.ok(breaks[0].breakClosePrice > breaks[0].brokenSwingPrice);
});

test('detectOrderBlocks identifies base origin candle and tracks mitigation status', () => {
  const bars: SmcPriceBar[] = [
    { date: '2026-09-01', open: 5000, high: 5100, low: 4950, close: 5050, volume: 1000 },
    { date: '2026-09-02', open: 5050, high: 5200, low: 5020, close: 5180, volume: 1000 }, // Swing high 5200
    { date: '2026-09-03', open: 5180, high: 5150, low: 4900, close: 4920, volume: 1500 }, // Bearish down candle (OB)
    { date: '2026-09-04', open: 4920, high: 5300, low: 4910, close: 5280, volume: 3000 }, // Impulsive breakout
    { date: '2026-09-05', open: 5280, high: 5320, low: 5000, close: 5150, volume: 1800 }, // Retest into OB (Low 5000)
  ];

  const swings = detectSwingPoints(bars, 1);
  const { breaks } = detectBreaksOfStructure(bars, swings);
  const orderBlocks = detectOrderBlocks(bars, breaks);

  assert.ok(orderBlocks.length >= 1, 'Should find at least 1 order block');
  const ob = orderBlocks[0];
  assert.equal(ob.type, 'BULLISH');
  assert.equal(ob.originDate, '2026-09-03');
  assert.equal(ob.top, 5150);
  assert.equal(ob.bottom, 4900);
  // Bar 5 retests into 5000 (between 4900 and 5150), so mitigationStatus should be PARTIALLY_MITIGATED or MITIGATED
  assert.ok(
    ob.mitigationStatus === 'PARTIALLY_MITIGATED' || ob.mitigationStatus === 'MITIGATED'
  );
});

test('detectFairValueGaps detects 3-bar imbalances and computes 50% Consequent Encroachment', () => {
  const bars: SmcPriceBar[] = [
    { date: '2026-09-01', open: 5000, high: 5080, low: 4980, close: 5050, volume: 1000 }, // Bar 1 (High: 5080)
    { date: '2026-09-02', open: 5050, high: 5250, low: 5050, close: 5240, volume: 2500 }, // Bar 2 (Strong green)
    { date: '2026-09-03', open: 5240, high: 5350, low: 5150, close: 5320, volume: 2000 }, // Bar 3 (Low: 5150) -> FVG 5080 to 5150
  ];

  const fvgs = detectFairValueGaps(bars, 0.5);
  assert.equal(fvgs.length, 1);
  const fvg = fvgs[0];
  assert.equal(fvg.type, 'BULLISH');
  assert.equal(fvg.bottom, 5080);
  assert.equal(fvg.top, 5150);
  assert.equal(fvg.cePrice, 5115); // (5080 + 5150) / 2
  assert.equal(fvg.mitigationStatus, 'UNMITIGATED');
});

test('detectLiquiditySweeps identifies turtle soup stop-hunts with prompt reclamation', () => {
  const bars: SmcPriceBar[] = [
    { date: '2026-09-01', open: 5000, high: 5050, low: 4900, close: 4950, volume: 1000 },
    { date: '2026-09-02', open: 4950, high: 4980, low: 4800, close: 4850, volume: 1200 }, // Swing Low 4800
    { date: '2026-09-03', open: 4850, high: 5000, low: 4850, close: 4950, volume: 1000 },
    { date: '2026-09-04', open: 4950, high: 5020, low: 4920, close: 4980, volume: 1000 },
    { date: '2026-09-05', open: 4980, high: 4950, low: 4750, close: 4880, volume: 3000 }, // Sweeps 4800 to 4750, closes 4880
  ];

  const swings = detectSwingPoints(bars, 1);
  const sweeps = detectLiquiditySweeps(bars, swings);

  assert.ok(sweeps.length >= 1, 'Should detect liquidity sweep');
  const sweep = sweeps[0];
  assert.equal(sweep.type, 'BULLISH_SWEEP');
  assert.equal(sweep.sweptPrice, 4800);
  assert.equal(sweep.reclaimed, true);
  assert.equal(sweep.sweepDate, '2026-09-05');
});

test('evaluateSmcConfluence correctly assigns regimes and scores', () => {
  // Test 1: PRIME_ORDER_BLOCK_DEFENSE
  const obResult = evaluateSmcConfluence({
    currentPrice: 5050,
    marketStructure: 'BULLISH_EXPANSION',
    activeBullishOB: {
      type: 'BULLISH',
      originDate: '2026-09-01',
      originIndex: 1,
      top: 5100,
      bottom: 5000,
      midpoint: 5050,
      mitigationStatus: 'UNMITIGATED',
    },
  });
  assert.equal(obResult.regime, 'PRIME_ORDER_BLOCK_DEFENSE');
  assert.equal(obResult.score, 90);

  // Test 2: LIQUIDITY_SWEEP_REVERSAL
  const sweepResult = evaluateSmcConfluence({
    currentPrice: 4850,
    marketStructure: 'RANGING',
    lastLiquiditySweep: {
      type: 'BULLISH_SWEEP',
      originIndex: 10,
      sweepDate: '2026-09-05',
      sweptPrice: 4800,
      reclaimedPrice: 4850,
      sweepDepthPct: 1.04,
      reclaimed: true,
    },
    daysSinceSweep: 1,
  });
  assert.equal(sweepResult.regime, 'LIQUIDITY_SWEEP_REVERSAL');
  assert.equal(sweepResult.score, 80);

  // Test 3: BEARISH_STRUCTURE_CHOCH
  const chochResult = evaluateSmcConfluence({
    currentPrice: 4700,
    marketStructure: 'BEARISH_CONTRACTION',
  });
  assert.equal(chochResult.regime, 'BEARISH_STRUCTURE_CHOCH');
  assert.equal(chochResult.score, 30);
});

test('evaluateSmartMoneyStructure master pipeline executes cleanly on full dataset and edge cases', () => {
  // Sparse bars
  const sparse = evaluateSmartMoneyStructure('BBRI', '2026-09-05', []);
  assert.equal(sparse.marketStructure, 'RANGING');
  assert.equal(sparse.confluenceRegime, 'NEUTRAL_STRUCTURE');

  // Full bars
  const bars: SmcPriceBar[] = [
    { date: '2026-09-01', open: 5000, high: 5050, low: 4950, close: 5000, volume: 1000 },
    { date: '2026-09-02', open: 5000, high: 5150, low: 4980, close: 5120, volume: 1200 },
    { date: '2026-09-03', open: 5120, high: 5250, low: 5100, close: 5220, volume: 1500 },
    { date: '2026-09-04', open: 5220, high: 5200, low: 5050, close: 5080, volume: 1100 },
    { date: '2026-09-05', open: 5080, high: 5350, low: 5070, close: 5320, volume: 3000 },
    { date: '2026-09-08', open: 5320, high: 5340, low: 5180, close: 5220, volume: 1500 },
  ];

  const full = evaluateSmartMoneyStructure('BBRI', '2026-09-08', bars);
  assert.equal(full.emiten, 'BBRI');
  assert.ok(full.currentPrice > 0);
  assert.ok(full.regimeScore >= 0 && full.regimeScore <= 100);
  assert.ok(full.advisory.length > 0);
});
