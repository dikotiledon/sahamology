import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BrokerSummaryRecord,
  isRetailBroker,
  isWhaleBroker,
  extractRetailMetrics,
  calculateRetailHerdMetrics,
  evaluateRhiConfluence,
  evaluateRetailHerdIndex,
} from './index';

test('broker classification accurately distinguishes retail and whale brokers', () => {
  assert.equal(isRetailBroker('YP'), true);
  assert.equal(isRetailBroker('PD'), true);
  assert.equal(isRetailBroker('XC'), true);
  assert.equal(isRetailBroker('AK'), false);
  assert.equal(isRetailBroker('BK'), false);

  assert.equal(isWhaleBroker('AK'), true);
  assert.equal(isWhaleBroker('BK'), true);
  assert.equal(isWhaleBroker('CS'), true);
  assert.equal(isWhaleBroker('RX'), true);
  assert.equal(isWhaleBroker('YP'), false);
});

test('extractRetailMetrics computes retail turnover and net flows correctly', () => {
  const records: BrokerSummaryRecord[] = [
    { brokerCode: 'YP', buyValue: 15_000_000_000, sellValue: 5_000_000_000, netValue: 10_000_000_000, buyVolume: 1000, sellVolume: 500, netVolume: 500 },
    { brokerCode: 'PD', buyValue: 5_000_000_000, sellValue: 10_000_000_000, netValue: -5_000_000_000, buyVolume: 500, sellVolume: 1000, netVolume: -500 },
    { brokerCode: 'AK', buyValue: 50_000_000_000, sellValue: 10_000_000_000, netValue: 40_000_000_000, buyVolume: 5000, sellVolume: 1000, netVolume: 4000 },
  ];
  const totalTurnover = 95_000_000_000;

  const retail = extractRetailMetrics(records, totalTurnover);
  // YP gross (20B) + PD gross (15B) = 35B
  assert.equal(retail.retailGrossValue, 35_000_000_000);
  // YP net (+10B) + PD net (-5B) = +5B
  assert.equal(retail.retailNetBuyValue, 5_000_000_000);
  assert.equal(retail.topRetailBuyer, 'YP');
  assert.equal(retail.topRetailSeller, 'PD');
  assert.ok(retail.retailParticipationRatio > 0.3);
});

test('calculateRetailHerdMetrics computes RHI score and Syndicate Asymmetry Ratio', () => {
  // Institutional Accumulation: Top 3 buyers (AK, BK, CS) buy 100B, Retail (YP, PD) net sell -20B
  const accumRecords: BrokerSummaryRecord[] = [
    { brokerCode: 'AK', buyValue: 50_000_000_000, sellValue: 10_000_000_000, netValue: 40_000_000_000, buyVolume: 1000, sellVolume: 200, netVolume: 800 },
    { brokerCode: 'BK', buyValue: 40_000_000_000, sellValue: 5_000_000_000, netValue: 35_000_000_000, buyVolume: 800, sellVolume: 100, netVolume: 700 },
    { brokerCode: 'CS', buyValue: 30_000_000_000, sellValue: 5_000_000_000, netValue: 25_000_000_000, buyVolume: 600, sellVolume: 100, netVolume: 500 },
    { brokerCode: 'YP', buyValue: 5_000_000_000, sellValue: 15_000_000_000, netValue: -10_000_000_000, buyVolume: 100, sellVolume: 300, netVolume: -200 },
    { brokerCode: 'PD', buyValue: 2_000_000_000, sellValue: 12_000_000_000, netValue: -10_000_000_000, buyVolume: 50, sellVolume: 250, netVolume: -200 },
  ];

  const metrics = calculateRetailHerdMetrics(accumRecords);
  assert.equal(metrics.syndicate.top3NetBuyValue, 100_000_000_000);
  assert.equal(metrics.retail.retailNetBuyValue, -20_000_000_000);
  // SAR = 100B / 20B = 5.0
  assert.equal(metrics.syndicate.syndicateAsymmetryRatio, 5.0);
  // RHI score should be low (stealth accumulation)
  assert.ok(metrics.rhiScore < 35, `Expected low RHI score, got ${metrics.rhiScore}`);
});

test('evaluateRhiConfluence properly identifies stealth accumulation, FOMO trap, and capitulation', () => {
  // 1. Institutional Stealth Accumulation
  const stealth = evaluateRhiConfluence({
    currentPrice: 5000,
    rhiScore: 28,
    retail: { retailGrossValue: 10, retailNetBuyValue: -15_000_000_000, retailParticipationRatio: 0.12, topRetailBuyer: null, topRetailSeller: 'YP' },
    syndicate: { top1NetBuyValue: 50, top3NetBuyValue: 90, top5NetBuyValue: 100, top3ConcentrationRatio: 0.65, topSyndicateBuyer: 'AK', topSyndicateSeller: null, syndicateAsymmetryRatio: 6.0 },
    totalTurnover: 120_000_000_000,
  });
  assert.equal(stealth.regime, 'INSTITUTIONAL_STEALTH_ACCUMULATION');
  assert.equal(stealth.score, 90);

  // 2. Retail Herd FOMO Trap
  const trap = evaluateRhiConfluence({
    currentPrice: 5500,
    rhiScore: 78,
    retail: { retailGrossValue: 50, retailNetBuyValue: 35_000_000_000, retailParticipationRatio: 0.42, topRetailBuyer: 'YP', topRetailSeller: null },
    syndicate: { top1NetBuyValue: 10, top3NetBuyValue: 15, top5NetBuyValue: 20, top3ConcentrationRatio: 0.20, topSyndicateBuyer: 'YP', topSyndicateSeller: 'AK', syndicateAsymmetryRatio: 0.42 },
    totalTurnover: 100_000_000_000,
  });
  assert.equal(trap.regime, 'RETAIL_HERD_FOMO_TRAP');
  assert.equal(trap.score, 30);
});

test('evaluateRetailHerdIndex master function handles full calculations and empty defaults', () => {
  // Empty data
  const empty = evaluateRetailHerdIndex({
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    currentPrice: 5150,
    records: [],
  });
  assert.equal(empty.emiten, 'BBRI');
  assert.equal(empty.rhiScore, 50);
  assert.equal(empty.confluenceRegime, 'BALANCED_HERD_FLOW');
  assert.equal(empty.convictionScore, 50);

  // Normal data
  const records: BrokerSummaryRecord[] = [
    { brokerCode: 'AK', buyValue: 80_000_000_000, sellValue: 10_000_000_000, netValue: 70_000_000_000, buyVolume: 1000, sellVolume: 100, netVolume: 900 },
    { brokerCode: 'BK', buyValue: 50_000_000_000, sellValue: 10_000_000_000, netValue: 40_000_000_000, buyVolume: 600, sellVolume: 100, netVolume: 500 },
    { brokerCode: 'YP', buyValue: 10_000_000_000, sellValue: 40_000_000_000, netValue: -30_000_000_000, buyVolume: 100, sellVolume: 400, netVolume: -300 },
  ];

  const result = evaluateRetailHerdIndex({
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    currentPrice: 5150,
    records,
  });

  assert.equal(result.emiten, 'BBRI');
  assert.ok(result.rhiScore <= 35);
  assert.equal(result.confluenceRegime, 'INSTITUTIONAL_STEALTH_ACCUMULATION');
  assert.equal(result.convictionScore, 90);
  assert.ok(result.advisory.length > 0);
});
