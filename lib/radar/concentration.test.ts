import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateConcentration } from './concentration';
import type { BrokerSummaryEntry } from './types';

describe('calculateConcentration', () => {
  it('handles empty input gracefully', () => {
    const res = calculateConcentration([]);
    assert.equal(res.top1NetValueRatio, 0);
    assert.equal(res.top3NetValueRatio, 0);
    assert.equal(res.retailDispersionIndex, 0);
    assert.equal(res.sellerCount, 0);
    assert.equal(res.buyerPriceClusteringPct, 0);
    assert.equal(res.isExtremeConcentration, false);
  });

  it('detects extreme concentration with dispersed retail sellers', () => {
    // 3 large institutional accumulators absorbing 80% of net value
    const buyers: BrokerSummaryEntry[] = [
      { brokerCode: 'AK', buyVolume: 1000, buyValue: 10000, sellVolume: 0, sellValue: 0, netVolume: 1000, netValue: 10000, avgBuyPrice: 1000, avgSellPrice: 0 },
      { brokerCode: 'BK', buyVolume: 800, buyValue: 8080, sellVolume: 0, sellValue: 0, netVolume: 800, netValue: 8080, avgBuyPrice: 1010, avgSellPrice: 0 },
      { brokerCode: 'ZP', buyVolume: 600, buyValue: 6030, sellVolume: 0, sellValue: 0, netVolume: 600, netValue: 6030, avgBuyPrice: 1005, avgSellPrice: 0 },
      { brokerCode: 'OD', buyVolume: 200, buyValue: 2000, sellVolume: 0, sellValue: 0, netVolume: 200, netValue: 2000, avgBuyPrice: 1000, avgSellPrice: 0 },
      { brokerCode: 'LG', buyVolume: 100, buyValue: 1000, sellVolume: 0, sellValue: 0, netVolume: 100, netValue: 1000, avgBuyPrice: 1000, avgSellPrice: 0 },
    ];

    // 20 retail sellers each selling small amounts
    const sellers: BrokerSummaryEntry[] = Array.from({ length: 20 }, (_, i) => ({
      brokerCode: `S${i}`,
      buyVolume: 0,
      buyValue: 0,
      sellVolume: 100,
      sellValue: 1355.5,
      netVolume: -100,
      netValue: -1355.5,
      avgBuyPrice: 0,
      avgSellPrice: 1000,
    }));

    const entries = [...buyers, ...sellers];
    const res = calculateConcentration(entries);

    // Total net buy: 10000 + 8080 + 6030 + 2000 + 1000 = 27110
    // Top 1: 10000 / 27110 = 0.3689
    // Top 3: (10000 + 8080 + 6030) / 27110 = 24110 / 27110 = 0.8893 (>= 60%)
    assert.equal(res.sellerCount, 20);
    assert.ok(res.top3NetValueRatio >= 0.8);
    assert.ok(res.retailDispersionIndex < 0.1, `HHI should be low (<0.1), got ${res.retailDispersionIndex}`);
    // Buyer price clustering: prices 1000, 1010, 1005 -> spread (1010-1000)/1005 = ~0.0099 (< 1%)
    assert.ok(res.buyerPriceClusteringPct < 0.02);
    assert.equal(res.isExtremeConcentration, true);
  });

  it('rejects concentration when sellers are concentrated (e.g. 1 major seller dumping)', () => {
    const entries: BrokerSummaryEntry[] = [
      { brokerCode: 'AK', buyVolume: 1000, buyValue: 10000, sellVolume: 0, sellValue: 0, netVolume: 1000, netValue: 10000, avgBuyPrice: 1000, avgSellPrice: 0 },
      { brokerCode: 'BK', buyVolume: 800, buyValue: 8000, sellVolume: 0, sellValue: 0, netVolume: 800, netValue: 8000, avgBuyPrice: 1000, avgSellPrice: 0 },
      // Only 2 sellers
      { brokerCode: 'YP', buyVolume: 0, buyValue: 0, sellVolume: 900, sellValue: 9000, netVolume: -900, netValue: -9000, avgBuyPrice: 0, avgSellPrice: 1000 },
      { brokerCode: 'PD', buyVolume: 0, buyValue: 0, sellVolume: 900, sellValue: 9000, netVolume: -900, netValue: -9000, avgBuyPrice: 0, avgSellPrice: 1000 },
    ];

    const res = calculateConcentration(entries);
    assert.equal(res.sellerCount, 2);
    assert.equal(res.isExtremeConcentration, false);
  });
});
