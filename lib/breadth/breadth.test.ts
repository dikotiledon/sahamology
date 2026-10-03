import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMarketRegime,
  calculateMarketBreadth,
  type BreadthConstituent,
} from './index';

test('classifyMarketRegime classifies OVERSOLD_CAPITULATION when SMA50 and EMA20 <= 15%', () => {
  const result = classifyMarketRegime({
    pctAboveEma20: 10.0,
    pctAboveSma50: 12.0,
    pctAboveSma200: 25.0,
    adRatio: 0.35,
    netNewHighs: -20,
    netForeignFlow: -500000000000,
  });

  assert.equal(result.regime, 'OVERSOLD_CAPITULATION');
  assert.equal(result.score <= 25, true);
  assert.match(result.advisory, /KAPITULASI PASAR EKSTREM/);
});

test('classifyMarketRegime classifies BULLISH_EXPANSION when SMA50 >= 60% and AD ratio >= 1.25', () => {
  const result = classifyMarketRegime({
    pctAboveEma20: 70.0,
    pctAboveSma50: 68.0,
    pctAboveSma200: 65.0,
    adRatio: 1.8,
    netNewHighs: 15,
    netForeignFlow: 350000000000,
  });

  assert.equal(result.regime, 'BULLISH_EXPANSION');
  assert.equal(result.score >= 75, true);
  assert.match(result.advisory, /EKSPANSI BULLISH/);
});

test('classifyMarketRegime classifies HEALTHY_PULLBACK when SMA50 >= 50% and EMA20 < 40%', () => {
  const result = classifyMarketRegime({
    pctAboveEma20: 32.0,
    pctAboveSma50: 55.0,
    pctAboveSma200: 58.0,
    adRatio: 0.9,
    netNewHighs: 2,
    netForeignFlow: 50000000000,
  });

  assert.equal(result.regime, 'HEALTHY_PULLBACK');
  assert.equal(result.score >= 50 && result.score <= 74, true);
  assert.match(result.advisory, /PULLBACK SEHAT/);
});

test('classifyMarketRegime classifies BEARISH_DISTRIBUTION when SMA50 < 40% and AD ratio < 0.85', () => {
  const result = classifyMarketRegime({
    pctAboveEma20: 25.0,
    pctAboveSma50: 32.0,
    pctAboveSma200: 40.0,
    adRatio: 0.65,
    netNewHighs: -12,
    netForeignFlow: -250000000000,
  });

  assert.equal(result.regime, 'BEARISH_DISTRIBUTION');
  assert.equal(result.score <= 39, true);
  assert.match(result.advisory, /DISTRIBUSI BEARISH/);
});

test('classifyMarketRegime classifies BREADTH_DIVERGENCE_WARNING on narrow market participation', () => {
  const result = classifyMarketRegime({
    pctAboveEma20: 42.0,
    pctAboveSma50: 43.0,
    pctAboveSma200: 48.0,
    adRatio: 0.92,
    netNewHighs: -4,
    netForeignFlow: -10000000000,
  });

  assert.equal(result.regime, 'BREADTH_DIVERGENCE_WARNING');
  assert.match(result.advisory, /PERINGATAN DIVERGENSI BREADTH/);
});

test('calculateMarketBreadth accurately computes advance/decline and percentage breadth', () => {
  const constituents: BreadthConstituent[] = [
    { emiten: 'BBRI', close: 5000, prevClose: 4900, ema20: 4800, sma50: 4700, sma200: 4500, high52w: 5050, low52w: 4000, foreignNetValue: 100000000000 },
    { emiten: 'BBCA', close: 10000, prevClose: 9900, ema20: 9800, sma50: 9700, sma200: 9500, high52w: 10100, low52w: 8000, foreignNetValue: 80000000000 },
    { emiten: 'BMRI', close: 6500, prevClose: 6550, ema20: 6600, sma50: 6400, sma200: 6200, high52w: 7000, low52w: 5500, foreignNetValue: -20000000000 },
    { emiten: 'TLKM', close: 3200, prevClose: 3300, ema20: 3400, sma50: 3500, sma200: 3600, high52w: 4000, low52w: 3150, foreignNetValue: -50000000000 },
  ];

  const result = calculateMarketBreadth('2026-10-03', constituents);

  assert.equal(result.constituentCount, 4);
  assert.equal(result.advancers, 2); // BBRI, BBCA
  assert.equal(result.decliners, 2); // BMRI, TLKM
  assert.equal(result.adRatio, 1.0); // 2 / 2
  assert.equal(result.pctAboveEma20, 50.0); // 2 of 4 (BBRI, BBCA)
  assert.equal(result.pctAboveSma50, 75.0); // 3 of 4 (BBRI, BBCA, BMRI)
  assert.equal(result.pctAboveSma200, 75.0); // 3 of 4 (BBRI, BBCA, BMRI)
  assert.equal(result.newHighs52w, 2); // BBRI (5000 >= 4949), BBCA (10000 >= 9898)
  assert.equal(result.newLows52w, 1); // TLKM (3200 <= 3213)
  assert.equal(result.netNewHighs, 1); // 2 - 1
  assert.equal(result.netForeignFlow, 110000000000); // 100B + 80B - 20B - 50B
  assert.ok(typeof result.marketRegime === 'string');
});

test('calculateMarketBreadth handles empty constituents gracefully', () => {
  const result = calculateMarketBreadth('2026-10-03', []);
  assert.equal(result.constituentCount, 0);
  assert.equal(result.advancers, 0);
  assert.equal(result.decliners, 0);
  assert.equal(result.adRatio, 1.0);
  assert.equal(result.pctAboveSma50, 0);
});
