import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateNgCrossing } from './crossing';
import type { BrokerSummaryEntry } from './types';

describe('calculateNgCrossing', () => {
  it('handles empty inputs', () => {
    const res = calculateNgCrossing({ ngEntries: [], rgEntries: [] });
    assert.equal(res.ngVolume, 0);
    assert.equal(res.ngValue, 0);
    assert.equal(res.hasSignificantCrossing, false);
    assert.deepEqual(res.crossingBrokers, []);
    assert.equal(res.rgFollowThroughScore, 0);
  });

  it('detects significant crossing exceeding 5B IDR threshold and follow-through', () => {
    const ngEntries: BrokerSummaryEntry[] = [
      { brokerCode: 'AK', buyVolume: 50000, buyValue: 6_000_000_000, sellVolume: 0, sellValue: 0, netVolume: 50000, netValue: 6_000_000_000, avgBuyPrice: 1200, avgSellPrice: 0 },
      { brokerCode: 'OD', buyVolume: 0, buyValue: 0, sellVolume: 50000, sellValue: 6_000_000_000, netVolume: -50000, netValue: -6_000_000_000, avgBuyPrice: 0, avgSellPrice: 1200 },
    ];

    // RG entries where AK is actively accumulating 70% of RG buy turnover
    const rgEntries: BrokerSummaryEntry[] = [
      { brokerCode: 'AK', buyVolume: 7000, buyValue: 7_000_000, sellVolume: 0, sellValue: 0, netVolume: 7000, netValue: 7_000_000, avgBuyPrice: 1000, avgSellPrice: 0 },
      { brokerCode: 'BK', buyVolume: 3000, buyValue: 3_000_000, sellVolume: 0, sellValue: 0, netVolume: 3000, netValue: 3_000_000, avgBuyPrice: 1000, avgSellPrice: 0 },
    ];

    const res = calculateNgCrossing({ ngEntries, rgEntries });
    assert.equal(res.hasSignificantCrossing, true);
    assert.ok(res.crossingBrokers.includes('AK'));
    assert.ok(res.crossingBrokers.includes('OD'));
    // AK net buy = 7M out of total 10M = 0.70 (70%)
    assert.equal(res.rgFollowThroughScore, 0.7);
  });

  it('detects significant crossing relative to average daily RG turnover', () => {
    // 2B IDR crossing, which is < 5B absolute, but average daily turnover is only 5B (so 2B is 40% > 20%)
    const ngEntries: BrokerSummaryEntry[] = [
      { brokerCode: 'ZP', buyVolume: 20000, buyValue: 2_000_000_000, sellVolume: 0, sellValue: 0, netVolume: 20000, netValue: 2_000_000_000, avgBuyPrice: 100, avgSellPrice: 0 },
    ];

    const res = calculateNgCrossing({
      ngEntries,
      rgEntries: [],
      avgDailyRgValue: 5_000_000_000, // 5B average turnover
    });

    assert.equal(res.hasSignificantCrossing, true);
    assert.equal(res.rgFollowThroughScore, 0); // No RG entries provided
  });
});
