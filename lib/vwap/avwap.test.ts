import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAvwapFromIndex,
  findBaseTroughIndex,
  findVolumeClimaxIndex,
  find52WeekHighIndex,
  calculateBandarVwap,
  evaluateVwapConfluence,
  evaluateAnchoredVwap,
  type VwapPriceBar,
  type BrokerSummaryItem,
} from './index';

test('calculateAvwapFromIndex computes volume-weighted typical price and volatility bands', () => {
  const bars: VwapPriceBar[] = [
    { date: '2026-09-01', open: 5000, high: 5100, low: 4950, close: 5050, volume: 10000 }, // TP = (5100+4950+5050)/3 = 5033.33
    { date: '2026-09-02', open: 5050, high: 5200, low: 5000, close: 5150, volume: 20000 }, // TP = (5200+5000+5150)/3 = 5116.67
    { date: '2026-09-03', open: 5150, high: 5300, low: 5100, close: 5250, volume: 30000 }, // TP = (5300+5100+5250)/3 = 5216.67
  ];

  const result = calculateAvwapFromIndex(bars, 0, 'Test Anchor');
  assert.ok(result !== null);
  assert.equal(result.sampleBars, 3);
  // Total Volume = 60,000
  // Total PV = 5033.33*10k + 5116.67*20k + 5216.67*30k = 50,333,333 + 102,333,333 + 156,500,000 = 309,166,666 / 60000 = ~5152.78
  assert.ok(result.vwap >= 5140 && result.vwap <= 5165);
  assert.ok(result.upperBand1sd > result.vwap);
  assert.ok(result.lowerBand1sd < result.vwap);
  assert.ok(result.upperBand2sd > result.upperBand1sd);
  assert.ok(result.lowerBand2sd < result.lowerBand1sd);
});

test('calculateAvwapFromIndex handles zero volume safely', () => {
  const bars: VwapPriceBar[] = [
    { date: '2026-09-01', open: 5000, high: 5000, low: 5000, close: 5000, volume: 0 },
  ];

  const result = calculateAvwapFromIndex(bars, 0, 'Zero Vol');
  assert.ok(result !== null);
  assert.equal(result.vwap, 5000);
  assert.equal(result.stdDev, 0);
});

test('anchor index selectors locate trough, climax, and 52w high indices', () => {
  const bars: VwapPriceBar[] = [
    { date: '2026-09-01', open: 4800, high: 4900, low: 4700, close: 4850, volume: 1000 }, // Lowest Low = 4700 (idx 0)
    { date: '2026-09-02', open: 4850, high: 5000, low: 4800, close: 4950, volume: 50000 }, // Highest Volume = 50,000 (idx 1)
    { date: '2026-09-03', open: 4950, high: 5500, low: 4900, close: 5400, volume: 2000 }, // Highest High = 5500 (idx 2)
  ];

  const baseIdx = findBaseTroughIndex(bars, 10);
  const climaxIdx = findVolumeClimaxIndex(bars, 10);
  const high52wIdx = find52WeekHighIndex(bars, 10);

  assert.equal(baseIdx, 0);
  assert.equal(climaxIdx, 1);
  assert.equal(high52wIdx, 2);
});

test('calculateBandarVwap correctly weights top-3 and top-5 accumulating brokers', () => {
  const brokers: BrokerSummaryItem[] = [
    { brokerCode: 'AK', netBuyValue: 50_000_000_000, netBuyLot: 100_000 }, // Price = 50B / (100k*100) = 5000
    { brokerCode: 'BK', netBuyValue: 30_000_000_000, netBuyLot: 60_000 },  // Price = 30B / (60k*100) = 5000
    { brokerCode: 'KZ', netBuyValue: 20_000_000_000, netBuyLot: 38_000 },  // Price = 20B / (38k*100) = 5263.16
    { brokerCode: 'ZP', netBuyValue: 10_000_000_000, netBuyLot: 20_000 },  // Price = 10B / (20k*100) = 5000
    { brokerCode: 'CC', netBuyValue: 5_000_000_000, netBuyLot: 10_000 },   // Price = 5B / (10k*100) = 5000
  ];

  const result = calculateBandarVwap(brokers);
  assert.ok(result.bandarVwapTop3 !== null);
  assert.ok(result.bandarVwapTop5 !== null);
  assert.equal(result.topBuyersCount, 5);
  // Top 3 value = 100B, shares = 19.8M -> 100,000,000,000 / 19,800,000 = ~5050.51
  assert.ok(result.bandarVwapTop3 >= 5040 && result.bandarVwapTop3 <= 5060);
});

test('evaluateVwapConfluence classifies INSTITUTIONAL_CAPITULATION_BREAKDOWN when price falls > 2% below AVWAP', () => {
  const baseAnchor = {
    anchorName: 'Base',
    anchorDate: '2026-09-01',
    anchorIndex: 0,
    vwap: 5000,
    upperBand1sd: 5200,
    lowerBand1sd: 4800,
    upperBand2sd: 5400,
    lowerBand2sd: 4600,
    stdDev: 200,
    sampleBars: 20,
  };

  const result = evaluateVwapConfluence({
    currentPrice: 4850, // -3.0% below base AVWAP 5000
    baseAnchor,
    volumeClimaxAnchor: null,
    high52wAnchor: null,
    bandarVwapTop3: 4950,
  });

  assert.equal(result.confluenceRegime, 'INSTITUTIONAL_CAPITULATION_BREAKDOWN');
  assert.equal(result.spreadToBasePct, -3.0);
  assert.match(result.advisory, /KAPITULASI BREAKDOWN/);
});

test('evaluateVwapConfluence classifies OVEREXTENDED_VALUE_EXHAUSTION when price breaks above +2 SD band', () => {
  const baseAnchor = {
    anchorName: 'Base',
    anchorDate: '2026-09-01',
    anchorIndex: 0,
    vwap: 5000,
    upperBand1sd: 5150,
    lowerBand1sd: 4850,
    upperBand2sd: 5300,
    lowerBand2sd: 4700,
    stdDev: 150,
    sampleBars: 20,
  };

  const result = evaluateVwapConfluence({
    currentPrice: 5380, // > 5300 (+2SD)
    baseAnchor,
    volumeClimaxAnchor: null,
    high52wAnchor: null,
    bandarVwapTop3: 5050,
  });

  assert.equal(result.confluenceRegime, 'OVEREXTENDED_VALUE_EXHAUSTION');
  assert.match(result.advisory, /NILAI OVEREXTENDED/);
});

test('evaluateVwapConfluence classifies AT_INSTITUTIONAL_DEFENSE when price holds near AVWAP', () => {
  const baseAnchor = {
    anchorName: 'Base',
    anchorDate: '2026-09-01',
    anchorIndex: 0,
    vwap: 5000,
    upperBand1sd: 5200,
    lowerBand1sd: 4800,
    upperBand2sd: 5400,
    lowerBand2sd: 4600,
    stdDev: 200,
    sampleBars: 20,
  };

  const result = evaluateVwapConfluence({
    currentPrice: 5040, // +0.8% above AVWAP
    baseAnchor,
    volumeClimaxAnchor: null,
    high52wAnchor: null,
    bandarVwapTop3: 5020,
  });

  assert.equal(result.confluenceRegime, 'AT_INSTITUTIONAL_DEFENSE');
  assert.match(result.advisory, /PERTAHANAN MODAL INSTITUSI/);
});

test('evaluateAnchoredVwap master function handles full pipeline and edge cases', () => {
  const bars: VwapPriceBar[] = [
    { date: '2026-09-01', open: 4900, high: 5000, low: 4850, close: 4950, volume: 10000 },
    { date: '2026-09-02', open: 4950, high: 5100, low: 4900, close: 5050, volume: 40000 },
    { date: '2026-09-03', open: 5050, high: 5200, low: 5000, close: 5150, volume: 20000 },
  ];

  const result = evaluateAnchoredVwap('BBRI', bars, [
    { brokerCode: 'AK', netBuyValue: 20_000_000_000, netBuyLot: 40_000 },
  ]);

  assert.equal(result.emiten, 'BBRI');
  assert.equal(result.currentPrice, 5150);
  assert.ok(result.baseAnchor.vwap > 0);
  assert.ok(result.bandarVwapTop3 !== null);
  assert.ok(typeof result.confluenceRegime === 'string');
});
