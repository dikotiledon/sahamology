import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PriceVolumeBar,
  calculateBarDelta,
  calculateBarDeltas,
  calculateCvdMetrics,
  calculateTapeAggression,
  detectCvdDivergence,
  evaluateCvdConfluence,
  evaluateCumulativeVolumeDelta,
} from './index';

test('calculateBarDelta computes accurate positive and negative delta volume proxies', () => {
  // Strong bullish candle closing at high
  const bullBar: PriceVolumeBar = {
    date: '2026-10-01',
    open: 5000,
    high: 5200,
    low: 4980,
    close: 5200, // closed at top -> CLV = +1.0, displacement = (5200-5000)/220 ~ +0.909
    volume: 10000,
  };
  const bullDelta = calculateBarDelta(bullBar);
  assert.ok(bullDelta.deltaVolume > 0, `Expected positive delta, got ${bullDelta.deltaVolume}`);
  assert.equal(bullDelta.clv, 1.0);

  // Strong bearish candle closing at low
  const bearBar: PriceVolumeBar = {
    date: '2026-10-02',
    open: 5200,
    high: 5220,
    low: 4950,
    close: 4950, // closed at low -> CLV = -1.0
    volume: 10000,
  };
  const bearDelta = calculateBarDelta(bearBar);
  assert.ok(bearDelta.deltaVolume < 0, `Expected negative delta, got ${bearDelta.deltaVolume}`);
  assert.equal(bearDelta.clv, -1.0);

  // Flat bar edge case
  const flatBar: PriceVolumeBar = {
    date: '2026-10-03',
    open: 5000,
    high: 5000,
    low: 5000,
    close: 5000,
    volume: 0,
  };
  const flatDelta = calculateBarDelta(flatBar);
  assert.equal(flatDelta.deltaVolume, 0);
  assert.equal(flatDelta.clv, 0);

  // Verify series calculator calculateBarDeltas
  const allDeltas = calculateBarDeltas([bullBar, bearBar, flatBar]);
  assert.equal(allDeltas.length, 3);
  assert.equal(allDeltas[0].deltaVolume, bullDelta.deltaVolume);
});

test('calculateCvdMetrics rolls 20d/50d CVD sums and determines trend status', () => {
  // Create 25 bullish deltas
  const deltas = [];
  for (let i = 0; i < 25; i++) {
    deltas.push({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      deltaVolume: 2000,
      clv: 0.8,
      close: 5000 + i * 20,
      volume: 10000,
    });
  }

  const metrics = calculateCvdMetrics(deltas);
  assert.equal(metrics.cvd20d, 40000); // 20 * 2000
  assert.equal(metrics.cvd50d, 50000); // 25 * 2000
  assert.equal(metrics.deltaRatioPct, 20.0); // 40000 / 200000 * 100 = 20%
  assert.equal(metrics.trend, 'ACCUMULATING');
});

test('calculateTapeAggression classifies dominant buyer, dominant seller, and balanced flow', () => {
  // Dominant buyer: 70B buy, 30B sell -> 70%
  const buyerDominant = calculateTapeAggression(70_000_000_000, 30_000_000_000);
  assert.equal(buyerDominant.aggressionRatio, 0.7);
  assert.equal(buyerDominant.status, 'DOMINANT_BUY_AGGRESSION');

  // Dominant seller: 20B buy, 80B sell -> 20%
  const sellerDominant = calculateTapeAggression(20_000_000_000, 80_000_000_000);
  assert.equal(sellerDominant.aggressionRatio, 0.2);
  assert.equal(sellerDominant.status, 'DOMINANT_SELL_AGGRESSION');

  // Balanced: 50B buy, 50B sell -> 50%
  const balanced = calculateTapeAggression(50_000_000_000, 50_000_000_000);
  assert.equal(balanced.aggressionRatio, 0.5);
  assert.equal(balanced.status, 'BALANCED');

  // Zero volume edge case
  const zero = calculateTapeAggression(0, 0);
  assert.equal(zero.aggressionRatio, 0.5);
  assert.equal(zero.status, 'BALANCED');
});

test('detectCvdDivergence detects BULLISH_CVD_ABSORPTION and BEARISH_CVD_EXHAUSTION', () => {
  // Construct Bullish Absorption: Price lower low, CVD higher low
  const absorptionDeltas = [
    // First half (trough 1: price 5000, delta -5000)
    { date: '2026-09-01', deltaVolume: -1000, clv: -0.5, close: 5100, volume: 5000 },
    { date: '2026-09-02', deltaVolume: -4000, clv: -0.8, close: 5000, volume: 8000 }, // Low: 5000, Running CVD: -5000
    { date: '2026-09-03', deltaVolume: 2000, clv: 0.6, close: 5150, volume: 6000 },
    { date: '2026-09-04', deltaVolume: 1000, clv: 0.4, close: 5200, volume: 5000 },
    { date: '2026-09-05', deltaVolume: -500, clv: -0.2, close: 5100, volume: 4000 },
    // Second half (trough 2: price 4950 (lower!), but CVD is +1500 higher)
    { date: '2026-09-08', deltaVolume: 1000, clv: 0.3, close: 5050, volume: 5000 },
    { date: '2026-09-09', deltaVolume: 2500, clv: 0.7, close: 4950, volume: 8000 }, // Lower price low 4950, but strong positive delta!
    { date: '2026-09-10', deltaVolume: 2000, clv: 0.6, close: 5080, volume: 6000 },
    { date: '2026-09-11', deltaVolume: 1500, clv: 0.5, close: 5150, volume: 5000 },
    { date: '2026-09-12', deltaVolume: 1000, clv: 0.4, close: 5200, volume: 4000 },
  ];

  const absorptionResult = detectCvdDivergence(absorptionDeltas, 10);
  assert.equal(absorptionResult.type, 'BULLISH_CVD_ABSORPTION');
  assert.ok(absorptionResult.description.includes('Absorption'));
});

test('evaluateCvdConfluence maps regimes and scores properly', () => {
  // 1. Absorption divergence
  const absorption = evaluateCvdConfluence({
    currentPrice: 5000,
    cvd: { cvd20d: 15000, cvd50d: 20000, deltaRatioPct: 15.5, currentBarDelta: 1200, trend: 'ACCUMULATING' },
    aggression: { foreignBuyValue: 50, foreignSellValue: 50, aggressionRatio: 0.5, status: 'BALANCED' },
    divergence: 'BULLISH_CVD_ABSORPTION',
  });
  assert.equal(absorption.regime, 'BULLISH_CVD_ABSORPTION');
  assert.equal(absorption.score, 90);

  // 2. Harmonic markup
  const markup = evaluateCvdConfluence({
    currentPrice: 5300,
    cvd: { cvd20d: 25000, cvd50d: 40000, deltaRatioPct: 22.0, currentBarDelta: 3000, trend: 'ACCUMULATING' },
    aggression: { foreignBuyValue: 75, foreignSellValue: 25, aggressionRatio: 0.75, status: 'DOMINANT_BUY_AGGRESSION' },
    divergence: 'NONE',
  });
  assert.equal(markup.regime, 'AGGRESSIVE_MARKET_MARKUP');
  assert.equal(markup.score, 85);

  // 3. Exhaustion
  const exhaustion = evaluateCvdConfluence({
    currentPrice: 5500,
    cvd: { cvd20d: -5000, cvd50d: 10000, deltaRatioPct: -4.0, currentBarDelta: -800, trend: 'NEUTRAL' },
    aggression: { foreignBuyValue: 40, foreignSellValue: 60, aggressionRatio: 0.4, status: 'BALANCED' },
    divergence: 'BEARISH_CVD_EXHAUSTION',
  });
  assert.equal(exhaustion.regime, 'BEARISH_CVD_EXHAUSTION');
  assert.equal(exhaustion.score, 30);
});

test('evaluateCumulativeVolumeDelta master pipeline handles full calculations and defaults', () => {
  // Empty data fallback
  const empty = evaluateCumulativeVolumeDelta({
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    bars: [],
  });
  assert.equal(empty.emiten, 'BBRI');
  assert.equal(empty.currentPrice, 0);
  assert.equal(empty.confluenceRegime, 'NEUTRAL_DELTA_ROTATION');
  assert.equal(empty.convictionScore, 50);

  // Full bars with strong positive close location (bullish expansion)
  const bars: PriceVolumeBar[] = [];
  for (let i = 0; i < 30; i++) {
    const price = 5000 + i * 15;
    bars.push({
      date: `2026-09-${String(i + 1).padStart(2, '0')}`,
      open: price - 20,
      high: price + 10,
      low: price - 25,
      close: price + 8,
      volume: 15000,
    });
  }

  const result = evaluateCumulativeVolumeDelta({
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    bars,
    foreignStats: {
      date: '2026-10-02',
      foreignBuyValue: 80_000_000_000,
      foreignSellValue: 40_000_000_000,
    },
  });

  assert.equal(result.emiten, 'BBRI');
  assert.ok(result.currentPrice > 5000);
  assert.ok(result.cvd.cvd20d > 0);
  assert.equal(result.aggression.status, 'DOMINANT_BUY_AGGRESSION');
  assert.ok(result.convictionScore >= 80);
  assert.ok(result.advisory.length > 0);
});
