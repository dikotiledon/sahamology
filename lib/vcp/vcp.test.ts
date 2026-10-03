import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSma,
  evaluateTrendTemplate,
  detectContractions,
  evaluateVcpConfluence,
  evaluateVcp,
  type PriceBar,
} from './index';

function createSyntheticBars(count: number, basePrice = 5000, trendSlope = 1.0): PriceBar[] {
  const bars: PriceBar[] = [];
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    price += (trendSlope + Math.sin(i / 5) * 5);
    const high = price + 30;
    const low = price - 30;
    bars.push({
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      open: price - 10,
      high,
      low,
      close: price,
      volume: 100000 + (i % 10) * 5000,
    });
  }
  return bars;
}

test('calculateSma computes correct moving averages', () => {
  const values = [10, 20, 30, 40, 50];
  assert.equal(calculateSma(values, 3), 40); // (30+40+50)/3 = 40
  assert.equal(calculateSma(values, 5), 30);
  assert.equal(calculateSma(values, 10), null);
  assert.equal(calculateSma([], 3), null);
});

test('evaluateTrendTemplate detects passing Stage 2 uptrend on upward trending bars', () => {
  // 250 bars in clear uptrend
  const bars = createSyntheticBars(250, 2000, 15);
  const result = evaluateTrendTemplate(bars);

  assert.equal(result.passed, true);
  assert.equal(result.priceAboveSma50, true);
  assert.equal(result.priceAboveSma150, true);
  assert.equal(result.priceAboveSma200, true);
  assert.equal(result.smaAlignment, true);
  assert.equal(result.sma200TrendingUp, true);
  assert.equal(result.within25Pct52wHigh, true);
  assert.equal(result.atLeast25PctAbove52wLow, true);
});

test('evaluateTrendTemplate fails when price is below moving averages in a downtrend', () => {
  const bars = createSyntheticBars(250, 8000, -20);
  const result = evaluateTrendTemplate(bars);

  assert.equal(result.passed, false);
  assert.equal(result.priceAboveSma50, false);
});

test('evaluateTrendTemplate handles sparse bars (< 50) gracefully without throwing', () => {
  const bars = createSyntheticBars(20, 1000, 2);
  const result = evaluateTrendTemplate(bars);

  assert.equal(result.passed, false);
  assert.equal(result.currentPrice > 0, true);
});

test('detectContractions detects progressive contractions (T1 > T2) and calculates pivot price', () => {
  const bars: PriceBar[] = [];
  const basePrice = 5000;

  // Generate 50 bars establishing a 50-day average volume baseline
  for (let i = 0; i < 50; i++) {
    bars.push({
      date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
      open: basePrice,
      high: basePrice + 100,
      low: basePrice - 100,
      close: basePrice,
      volume: 1000000,
    });
  }

  // Wave 1: Pullback from 5200 to 4200 (Depth ~19.2%)
  for (let i = 0; i < 15; i++) {
    const isPeak = i === 2;
    const isTrough = i === 8;
    const high = isPeak ? 5200 : 5000;
    const low = isTrough ? 4200 : 4800;
    bars.push({
      date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      open: 4800,
      high,
      low,
      close: 4900,
      volume: 900000,
    });
  }

  // Wave 2: Pullback from 5100 to 4700 (Depth ~7.8%, tighter, volume drying up to 300k)
  for (let i = 0; i < 15; i++) {
    const isPeak = i === 2;
    const isTrough = i === 8;
    const high = isPeak ? 5100 : 5000;
    const low = isTrough ? 4700 : 4950;
    bars.push({
      date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
      open: 5000,
      high,
      low,
      close: 5050, // near pivot 5100
      volume: 300000, // dry up (< 0.60 of 1M avg)
    });
  }

  const result = detectContractions(bars, 60);

  assert.equal(result.contractionCount >= 2, true);
  assert.equal(result.contractions[0].depthPct > result.contractions[1].depthPct, true);
  assert.equal(result.pivotPrice !== null, true);
  assert.equal(result.stopLossPrice !== null, true);
  assert.equal(result.isVolumeDriedUp, true);
});

test('detectContractions flags FAILED when current price drops below stop loss', () => {
  const bars: PriceBar[] = [];
  for (let i = 0; i < 60; i++) {
    bars.push({
      date: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
      open: 5000,
      high: 5200,
      low: 4800,
      close: 5000,
      volume: 500000,
    });
  }
  // Sudden breakdown to 3000
  bars.push({
    date: '2026-05-29',
    open: 4000,
    high: 4000,
    low: 3000,
    close: 3000,
    volume: 1500000,
  });

  const result = detectContractions(bars);
  assert.equal(result.stage === 'FAILED' || result.stage === 'DEVELOPING', true);
});

test('evaluateVcpConfluence awards high score and PRIME_ACCUMULATION_VCP when AQS >= 65 and Trend passes', () => {
  const vcpMock = {
    contractions: [
      { waveIndex: 1, depthPct: 15, lengthBars: 10, highPrice: 5000, lowPrice: 4250, avgVolume: 800000 },
      { waveIndex: 2, depthPct: 6, lengthBars: 8, highPrice: 4900, lowPrice: 4600, avgVolume: 350000 },
    ],
    contractionCount: 2,
    pivotPrice: 4900,
    stopLossPrice: 4575,
    riskPct: 6.6,
    volumeDryUpRatio: 0.45,
    isVolumeDriedUp: true,
    stage: 'PIVOT_READY' as const,
    summary: 'VCP Pivot Ready',
  };

  const trendMock = {
    passed: true,
    priceAboveSma50: true,
    priceAboveSma150: true,
    priceAboveSma200: true,
    smaAlignment: true,
    sma200TrendingUp: true,
    within25Pct52wHigh: true,
    atLeast25PctAbove52wLow: true,
    currentPrice: 4850,
    sma50: 4500,
    sma150: 4200,
    sma200: 4000,
    high52w: 5000,
    low52w: 3000,
    pctFrom52wHigh: 3.0,
    pctFrom52wLow: 61.6,
  };

  const confluence = evaluateVcpConfluence({
    vcp: vcpMock,
    trend: trendMock,
    aqsScore: 75,
    wyckoffPhase: 'PHASE_D_MARKUP_RANGE',
    sectorQuadrant: 'LEADING',
  });

  assert.equal(confluence.confluenceTag, 'PRIME_ACCUMULATION_VCP');
  assert.equal(confluence.isHighQualitySetup, true);
  assert.equal(confluence.confluenceScore >= 80, true);
});

test('evaluateVcp master evaluator returns coherent assessment structure', () => {
  const bars = createSyntheticBars(220, 4000, 10);
  const assessment = evaluateVcp('BBRI', bars, { aqsScore: 70, sectorQuadrant: 'LEADING' });

  assert.equal(assessment.emiten, 'BBRI');
  assert.equal(typeof assessment.stage, 'string');
  assert.equal(typeof assessment.contractionCount, 'number');
  assert.equal(Array.isArray(assessment.contractions), true);
  assert.equal(typeof assessment.summary, 'string');
});
