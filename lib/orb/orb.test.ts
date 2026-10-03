import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IntradayBar,
  calculateInitialBalance,
  extractIbBars,
  classifyMarketDayType,
  evaluateOrbConfluence,
  evaluateOpeningRangeBreakout,
} from './index';

test('calculateInitialBalance accurately computes high, low, range, midpoint, and extensions', () => {
  const bars: IntradayBar[] = [
    { time: '09:05', open: 5000, high: 5100, low: 4980, close: 5080, volume: 1000 },
    { time: '09:10', open: 5080, high: 5150, low: 5050, close: 5120, volume: 1500 },
    { time: '09:15', open: 5120, high: 5200, low: 5100, close: 5180, volume: 2000 },
  ];

  const ib = calculateInitialBalance(bars);
  assert.equal(ib.high, 5200);
  assert.equal(ib.low, 4980);
  assert.equal(ib.range, 220); // 5200 - 4980
  assert.equal(ib.midpoint, 5090); // (5200 + 4980) / 2
  assert.equal(ib.extensionR1, 5310); // 5200 + 0.5 * 220
  assert.equal(ib.extensionR2, 5420); // 5200 + 1.0 * 220
  assert.equal(ib.extensionS1, 4870); // 4980 - 0.5 * 220
  assert.equal(ib.extensionS2, 4760); // 4980 - 1.0 * 220
});

test('extractIbBars properly partitions bars by cutoff time', () => {
  const bars: IntradayBar[] = [
    { time: '09:05', open: 5000, high: 5050, low: 4980, close: 5020, volume: 1000 },
    { time: '09:15', open: 5020, high: 5100, low: 5010, close: 5080, volume: 1200 },
    { time: '09:30', open: 5080, high: 5150, low: 5050, close: 5120, volume: 1500 },
    { time: '10:00', open: 5120, high: 5200, low: 5100, close: 5180, volume: 1800 },
    { time: '10:30', open: 5180, high: 5250, low: 5150, close: 5220, volume: 2000 },
  ];

  const ib15 = extractIbBars(bars, '09:15');
  assert.equal(ib15.length, 2);
  assert.equal(ib15[ib15.length - 1].time, '09:15');

  const ib60 = extractIbBars(bars, '10:00');
  assert.equal(ib60.length, 4);
  assert.equal(ib60[ib60.length - 1].time, '10:00');
});

test('classifyMarketDayType identifies TREND_DAY_EXPANSION and FAILED_BREAKOUT_TRAP', () => {
  const ib15 = {
    high: 5100,
    low: 5000,
    range: 100,
    midpoint: 5050,
    extensionR1: 5150,
    extensionR2: 5200,
    extensionS1: 4950,
    extensionS2: 4900,
  };

  // Trend Day: Price expands to 5300 (Day range = 300, RF = 3.0 >= 2.0)
  const trendBars: IntradayBar[] = [
    { time: '09:15', open: 5000, high: 5100, low: 5000, close: 5080, volume: 1000 },
    { time: '10:00', open: 5080, high: 5200, low: 5080, close: 5190, volume: 2000 },
    { time: '11:00', open: 5190, high: 5300, low: 5180, close: 5280, volume: 2500 },
  ];
  const trendResult = classifyMarketDayType(trendBars, ib15);
  assert.equal(trendResult.dayType, 'TREND_DAY_EXPANSION');
  assert.ok(trendResult.rangeExpansionFactor >= 2.0);

  // False Breakout Trap: Probed 5110 then collapsed to close at 5020 (below midpoint 5050)
  const trapBars: IntradayBar[] = [
    { time: '09:15', open: 5000, high: 5100, low: 5000, close: 5080, volume: 1000 },
    { time: '09:30', open: 5080, high: 5120, low: 5060, close: 5070, volume: 1200 }, // Probes above 5100
    { time: '10:00', open: 5070, high: 5080, low: 4990, close: 5010, volume: 2500 }, // Closes below midpoint 5050
  ];
  const trapResult = classifyMarketDayType(trapBars, ib15);
  assert.equal(trapResult.dayType, 'FAILED_BREAKOUT_TRAP');
});

test('evaluateOrbConfluence assigns appropriate regimes and scores', () => {
  const ib15 = {
    high: 5100,
    low: 5000,
    range: 100,
    midpoint: 5050,
    extensionR1: 5150,
    extensionR2: 5200,
    extensionS1: 4950,
    extensionS2: 4900,
  };

  // 1. Bullish expansion
  const expansion = evaluateOrbConfluence({
    currentPrice: 5150,
    ib15,
    dayType: 'TREND_DAY_EXPANSION',
    v15mVolume: 10000,
  });
  assert.equal(expansion.regime, 'ORB_BULLISH_EXPANSION');
  assert.equal(expansion.score, 90);

  // 2. Pullback retest of IB high
  const retest = evaluateOrbConfluence({
    currentPrice: 5105,
    ib15,
    dayType: 'NORMAL_VARIATION_DAY',
    v15mVolume: 10000,
  });
  assert.equal(retest.regime, 'ORB_PULLBACK_RETEST');
  assert.equal(retest.score, 85);

  // 3. Inside IB coiling
  const coiling = evaluateOrbConfluence({
    currentPrice: 5040,
    ib15,
    dayType: 'NEUTRAL_ROTATIONAL_DAY',
    v15mVolume: 5000,
  });
  assert.equal(coiling.regime, 'INSIDE_IB_COILING');
  assert.equal(coiling.score, 60);

  // 4. False breakout trap
  const trap = evaluateOrbConfluence({
    currentPrice: 5020,
    ib15,
    dayType: 'FAILED_BREAKOUT_TRAP',
    v15mVolume: 5000,
  });
  assert.equal(trap.regime, 'ORB_FALSE_BREAKOUT_TRAP');
  assert.equal(trap.score, 30);
});

test('evaluateOpeningRangeBreakout master function executes full pipeline and handles empty data', () => {
  // Empty data fallback
  const empty = evaluateOpeningRangeBreakout('BBRI', '2026-10-02', [], 5150);
  assert.equal(empty.emiten, 'BBRI');
  assert.equal(empty.currentPrice, 5150);
  assert.equal(empty.confluenceRegime, 'NEUTRAL_IB');
  assert.equal(empty.convictionScore, 50);

  // Realistic intraday session
  const bars: IntradayBar[] = [
    { time: '09:05', open: 5000, high: 5080, low: 4980, close: 5050, volume: 1000 },
    { time: '09:10', open: 5050, high: 5120, low: 5040, close: 5100, volume: 1500 },
    { time: '09:15', open: 5100, high: 5150, low: 5080, close: 5140, volume: 2000 }, // IB15: High 5150, Low 4980
    { time: '09:30', open: 5140, high: 5220, low: 5120, close: 5200, volume: 2500 }, // Breakout above 5150
    { time: '10:00', open: 5200, high: 5280, low: 5180, close: 5250, volume: 3000 }, // IB60: High 5280, Low 4980
    { time: '11:00', open: 5250, high: 5350, low: 5230, close: 5320, volume: 4000 }, // Trend extension
  ];

  const result = evaluateOpeningRangeBreakout('BBRI', '2026-10-02', bars);
  assert.equal(result.emiten, 'BBRI');
  assert.equal(result.currentPrice, 5320);
  assert.equal(result.ib15.high, 5150);
  assert.equal(result.ib15.low, 4980);
  assert.ok(result.ib60 !== null);
  assert.equal(result.ib60!.high, 5280);
  assert.equal(result.confluenceRegime, 'ORB_BULLISH_EXPANSION');
  assert.equal(result.convictionScore, 90);
  assert.ok(result.v15mVolume === 4500);
  assert.ok(result.advisory.length > 0);
});
