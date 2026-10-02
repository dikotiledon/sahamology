import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateRadar } from './score';
import type { BrokerSummaryEntry } from './types';
import type { PriceBar } from './volume-anomaly';

describe('evaluateRadar', () => {
  it('returns neutral evaluation for empty inputs', () => {
    const res = evaluateRadar({
      emiten: 'BBCA',
      asOf: '2026-10-02',
      rgSummary: [],
    });

    assert.equal(res.emiten, 'BBCA');
    assert.equal(res.score, 50);
    assert.equal(res.verdict, 'NEUTRAL');
    assert.equal(res.concentration.isExtremeConcentration, false);
    assert.equal(res.segmentation.isInstitutionalAbsorption, false);
    assert.equal(res.volumeAnomaly.isSilentAccumulation, false);
  });

  it('detects strong accumulation across multiple confluent insider signatures', () => {
    // 1. Extreme concentration: Top 3 foreign brokers absorb 85% of volume
    const rgSummary: BrokerSummaryEntry[] = [
      { brokerCode: 'AK', buyVolume: 5000, buyValue: 50_000_000, sellVolume: 0, sellValue: 0, netVolume: 5000, netValue: 50_000_000, avgBuyPrice: 1000, avgSellPrice: 0 },
      { brokerCode: 'BK', buyVolume: 3000, buyValue: 30_000_000, sellVolume: 0, sellValue: 0, netVolume: 3000, netValue: 30_000_000, avgBuyPrice: 1005, avgSellPrice: 0 },
      { brokerCode: 'ZP', buyVolume: 2000, buyValue: 20_000_000, sellVolume: 0, sellValue: 0, netVolume: 2000, netValue: 20_000_000, avgBuyPrice: 1002, avgSellPrice: 0 },
      { brokerCode: 'OD', buyVolume: 500, buyValue: 5_000_000, sellVolume: 0, sellValue: 0, netVolume: 500, netValue: 5_000_000, avgBuyPrice: 1000, avgSellPrice: 0 },
    ];

    // 20 retail sellers each selling
    for (let i = 0; i < 20; i++) {
      rgSummary.push({
        brokerCode: i % 2 === 0 ? 'YP' : 'PD',
        buyVolume: 0,
        buyValue: 0,
        sellVolume: 250,
        sellValue: 5_250_000,
        netVolume: -250,
        netValue: -5_250_000,
        avgBuyPrice: 0,
        avgSellPrice: 1000,
      });
    }

    // 2. Significant Pasar Nego crossing
    const ngSummary: BrokerSummaryEntry[] = [
      { brokerCode: 'AK', buyVolume: 50000, buyValue: 10_000_000_000, sellVolume: 0, sellValue: 0, netVolume: 50000, netValue: 10_000_000_000, avgBuyPrice: 1000, avgSellPrice: 0 },
    ];

    // 3. Silent accumulation bars (volume 3.5x with compressed range)
    const priceBars: PriceBar[] = [];
    for (let i = 0; i < 50; i++) {
      priceBars.push({ open: 1000, high: 1025, low: 975, close: 1000, volume: 1_000_000 });
    }
    priceBars.push({ open: 1000, high: 1010, low: 990, close: 1005, volume: 3_500_000 });

    // 4. Consistent 10d / 20d broker flow
    const historicalFlow = [];
    for (let i = 1; i <= 20; i++) {
      const date = `2026-09-${String(i).padStart(2, '0')}`;
      historicalFlow.push({ date, brokerCode: 'AK', netValue: 5_000_000 });
    }

    const res = evaluateRadar({
      emiten: 'BBCA',
      asOf: '2026-10-02',
      rgSummary,
      ngSummary,
      priceBars,
      avgDailyRgValue: 20_000_000_000,
      historicalFlow,
    });

    assert.ok(res.score >= 80, `Expected score >= 80, got ${res.score}`);
    assert.equal(res.verdict, 'STRONG_ACCUMULATION');
    assert.equal(res.concentration.isExtremeConcentration, true);
    assert.equal(res.segmentation.isInstitutionalAbsorption, true);
    assert.equal(res.volumeAnomaly.isSilentAccumulation, true);
    assert.equal(res.ngCrossing.hasSignificantCrossing, true);
    assert.ok(res.evidence.length >= 3);
  });
});
