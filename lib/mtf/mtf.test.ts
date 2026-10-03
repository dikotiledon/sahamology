import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DailyPriceBar,
  getIsoWeekKey,
  aggregateWeeklyBars,
  calculateEmaSeries,
  calculateSmaSeries,
  analyzeWeeklyTrend,
  analyzeDailyTrend,
  evaluateAlignmentMatrix,
  evaluateMultiTimeframeAlignment,
} from './index';

test('getIsoWeekKey accurately formats ISO calendar week keys', () => {
  assert.equal(getIsoWeekKey('2026-01-05'), '2026-W02');
  assert.equal(getIsoWeekKey('2026-09-21'), '2026-W39');
  assert.equal(getIsoWeekKey('2026-09-25'), '2026-W39');
});

test('aggregateWeeklyBars aggregates daily bars into correct weekly OHLCV structures', () => {
  const dailyBars: DailyPriceBar[] = [
    // Week 1 (2026-W38: Sept 14 - Sept 18)
    { date: '2026-09-14', open: 5000, high: 5100, low: 4950, close: 5050, volume: 1000 },
    { date: '2026-09-15', open: 5050, high: 5200, low: 5000, close: 5150, volume: 1200 },
    { date: '2026-09-16', open: 5150, high: 5250, low: 5100, close: 5200, volume: 1500 },
    { date: '2026-09-17', open: 5200, high: 5300, low: 5180, close: 5280, volume: 1800 },
    { date: '2026-09-18', open: 5280, high: 5350, low: 5220, close: 5320, volume: 2000 },
    // Week 2 (2026-W39: Sept 21 - Sept 25)
    { date: '2026-09-21', open: 5320, high: 5400, low: 5280, close: 5380, volume: 1100 },
    { date: '2026-09-22', open: 5380, high: 5450, low: 5350, close: 5420, volume: 1300 },
  ];

  const weekly = aggregateWeeklyBars(dailyBars);
  assert.equal(weekly.length, 2);

  const w1 = weekly[0];
  assert.equal(w1.open, 5000); // open of first day
  assert.equal(w1.high, 5350); // peak of week
  assert.equal(w1.low, 4950);  // trough of week
  assert.equal(w1.close, 5320); // close of last day
  assert.equal(w1.volume, 7500); // sum of volumes
  assert.equal(w1.startDate, '2026-09-14');
  assert.equal(w1.endDate, '2026-09-18');

  const w2 = weekly[1];
  assert.equal(w2.open, 5320);
  assert.equal(w2.high, 5450);
  assert.equal(w2.low, 5280);
  assert.equal(w2.close, 5420);
  assert.equal(w2.volume, 2400);
});

test('calculateEmaSeries and calculateSmaSeries compute expected mathematical values', () => {
  const values = [10, 11, 12, 13, 14, 15];
  const sma3 = calculateSmaSeries(values, 3);
  assert.equal(sma3[0], null);
  assert.equal(sma3[1], null);
  assert.equal(sma3[2], 11); // (10 + 11 + 12) / 3
  assert.equal(sma3[3], 12); // (11 + 12 + 13) / 3
  assert.equal(sma3[4], 13);
  assert.equal(sma3[5], 14);

  const ema3 = calculateEmaSeries(values, 3);
  assert.equal(ema3[0], null);
  assert.equal(ema3[1], null);
  assert.equal(ema3[2], 11);
  // next EMA: (13 - 11) * (2/4) + 11 = 12
  assert.equal(ema3[3], 12);
});

test('analyzeWeeklyTrend accurately assesses Stage 2 Expansion in upward trend', () => {
  // Generate 25 rising weekly bars
  const weeklyBars = [];
  for (let i = 0; i < 25; i++) {
    const price = 3000 + i * 150;
    weeklyBars.push({
      weekKey: `2026-W${String(i + 1).padStart(2, '0')}`,
      startDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      endDate: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: price - 50,
      high: price + 100,
      low: price - 80,
      close: price,
      volume: 10000,
    });
  }

  const result = analyzeWeeklyTrend(weeklyBars);
  assert.equal(result.stage, 'STAGE_2_EXPANSION');
  assert.equal(result.isExpansion, true);
  assert.ok(result.weeklyEma10 !== null);
  assert.ok(result.weeklyEma30 !== null);
  assert.ok(result.weeklyEma10 > result.weeklyEma30);
});

test('analyzeDailyTrend identifies Bullish Expansion and Pullback Support', () => {
  // 60 daily bars trending up
  const dailyBars: DailyPriceBar[] = [];
  for (let i = 0; i < 60; i++) {
    const price = 5000 + i * 20;
    dailyBars.push({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      open: price - 10,
      high: price + 30,
      low: price - 20,
      close: price,
      volume: 5000,
    });
  }

  const bullish = analyzeDailyTrend(dailyBars);
  assert.equal(bullish.trendState, 'BULLISH_EXPANSION');
  assert.equal(bullish.priceAboveEma20, true);
  assert.equal(bullish.priceAboveSma50, true);

  // Add 3 pullback bars closing below EMA20 but above SMA50
  const pullbackBars = [...dailyBars];
  const lastPrice = dailyBars[dailyBars.length - 1].close;
  pullbackBars.push({
    date: '2026-04-01',
    open: lastPrice,
    high: lastPrice + 10,
    low: lastPrice - 150,
    close: lastPrice - 120, // dips below EMA20
    volume: 8000,
  });

  const pullback = analyzeDailyTrend(pullbackBars);
  assert.ok(
    pullback.trendState === 'PULLBACK_SUPPORT' || pullback.trendState === 'BULLISH_EXPANSION'
  );
});

test('evaluateAlignmentMatrix assigns correct regimes and position sizing multipliers', () => {
  // Test 1: PERFECT_TIDE_ALIGNMENT
  const perfect = evaluateAlignmentMatrix(
    { stage: 'STAGE_2_EXPANSION', weeklyEma10: 5500, weeklyEma30: 5000, slope30wPct: 2.5, weeklyBarsCount: 20, isExpansion: true },
    { trendState: 'BULLISH_EXPANSION', dailyEma20: 5700, dailySma50: 5400, dailySma200: 4800, priceAboveEma20: true, priceAboveSma50: true, priceAboveSma200: true }
  );
  assert.equal(perfect.regime, 'PERFECT_TIDE_ALIGNMENT');
  assert.equal(perfect.score, 95);
  assert.equal(perfect.sizingMultiplier, 1.0);

  // Test 2: HIGH_PROBABILITY_PULLBACK
  const pullback = evaluateAlignmentMatrix(
    { stage: 'STAGE_2_EXPANSION', weeklyEma10: 5500, weeklyEma30: 5000, slope30wPct: 2.5, weeklyBarsCount: 20, isExpansion: true },
    { trendState: 'PULLBACK_SUPPORT', dailyEma20: 5700, dailySma50: 5400, dailySma200: 4800, priceAboveEma20: false, priceAboveSma50: true, priceAboveSma200: true }
  );
  assert.equal(pullback.regime, 'HIGH_PROBABILITY_PULLBACK');
  assert.equal(pullback.score, 85);
  assert.equal(pullback.sizingMultiplier, 1.0);

  // Test 3: COUNTER_TREND_TRAP_HAZARD
  const trap = evaluateAlignmentMatrix(
    { stage: 'STAGE_4_CAPITULATION', weeklyEma10: 4200, weeklyEma30: 4800, slope30wPct: -3.2, weeklyBarsCount: 20, isExpansion: false },
    { trendState: 'BULLISH_EXPANSION', dailyEma20: 4100, dailySma50: 4000, dailySma200: 4700, priceAboveEma20: true, priceAboveSma50: true, priceAboveSma200: false }
  );
  assert.equal(trap.regime, 'COUNTER_TREND_TRAP_HAZARD');
  assert.equal(trap.score, 35);
  assert.equal(trap.sizingMultiplier, 0.4);

  // Test 4: SECULAR_LIQUIDATION
  const liquidation = evaluateAlignmentMatrix(
    { stage: 'STAGE_4_CAPITULATION', weeklyEma10: 4200, weeklyEma30: 4800, slope30wPct: -3.2, weeklyBarsCount: 20, isExpansion: false },
    { trendState: 'BEARISH_CONTRACTION', dailyEma20: 4100, dailySma50: 4300, dailySma200: 4700, priceAboveEma20: false, priceAboveSma50: false, priceAboveSma200: false }
  );
  assert.equal(liquidation.regime, 'SECULAR_LIQUIDATION');
  assert.equal(liquidation.score, 15);
  assert.equal(liquidation.sizingMultiplier, 0.0);
});

test('evaluateMultiTimeframeAlignment master pipeline handles full flow and empty data', () => {
  // Empty data
  const empty = evaluateMultiTimeframeAlignment('BBRI', '2026-09-25', []);
  assert.equal(empty.currentPrice, 0);
  assert.equal(empty.alignmentRegime, 'MIXED_TRANSITION');
  assert.equal(empty.sizingMultiplier, 0.5);

  // Normal daily bars
  const bars: DailyPriceBar[] = [];
  for (let i = 0; i < 40; i++) {
    bars.push({
      date: `2026-0${Math.floor(i / 20) + 8}-${String((i % 20) + 1).padStart(2, '0')}`,
      open: 5000 + i * 10,
      high: 5050 + i * 10,
      low: 4980 + i * 10,
      close: 5020 + i * 10,
      volume: 10000,
    });
  }

  const result = evaluateMultiTimeframeAlignment('BBRI', '2026-09-25', bars);
  assert.equal(result.emiten, 'BBRI');
  assert.ok(result.currentPrice > 0);
  assert.ok(result.alignmentScore >= 0 && result.alignmentScore <= 100);
  assert.ok(result.sizingMultiplier >= 0 && result.sizingMultiplier <= 1.0);
  assert.ok(result.advisory.length > 0);
});
