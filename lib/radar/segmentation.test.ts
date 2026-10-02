import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { classifyBroker, calculateSegmentation } from './segmentation';
import type { BrokerSummaryEntry } from './types';

describe('classifyBroker', () => {
  it('correctly maps foreign custodians', () => {
    assert.equal(classifyBroker('AK'), 'FOREIGN_CUSTODIAN');
    assert.equal(classifyBroker('BK'), 'FOREIGN_CUSTODIAN');
    assert.equal(classifyBroker('RX'), 'FOREIGN_CUSTODIAN');
    assert.equal(classifyBroker('ZP'), 'FOREIGN_CUSTODIAN');
  });

  it('correctly maps domestic institutions', () => {
    assert.equal(classifyBroker('OD'), 'DOMESTIC_INSTITUTION');
    assert.equal(classifyBroker('NI'), 'DOMESTIC_INSTITUTION');
    assert.equal(classifyBroker('CC'), 'DOMESTIC_INSTITUTION');
  });

  it('correctly maps retail brokers', () => {
    assert.equal(classifyBroker('YP'), 'RETAIL');
    assert.equal(classifyBroker('PD'), 'RETAIL');
    assert.equal(classifyBroker('XC'), 'RETAIL');
    assert.equal(classifyBroker('XL'), 'RETAIL');
  });

  it('maps unknown codes to UNKNOWN', () => {
    assert.equal(classifyBroker('ZZZZ'), 'UNKNOWN');
    assert.equal(classifyBroker(''), 'UNKNOWN');
  });
});

describe('calculateSegmentation', () => {
  it('detects institutional and foreign absorption of retail liquidation', () => {
    const entries: BrokerSummaryEntry[] = [
      // Foreign Custodians buying heavily
      { brokerCode: 'AK', buyVolume: 500, buyValue: 5000, sellVolume: 0, sellValue: 0, netVolume: 500, netValue: 5000, avgBuyPrice: 1000, avgSellPrice: 0 },
      { brokerCode: 'BK', buyVolume: 300, buyValue: 3000, sellVolume: 0, sellValue: 0, netVolume: 300, netValue: 3000, avgBuyPrice: 1000, avgSellPrice: 0 },
      // Domestic institution buying
      { brokerCode: 'OD', buyVolume: 200, buyValue: 2000, sellVolume: 0, sellValue: 0, netVolume: 200, netValue: 2000, avgBuyPrice: 1000, avgSellPrice: 0 },
      // Retail selling heavily
      { brokerCode: 'YP', buyVolume: 0, buyValue: 0, sellVolume: 400, sellValue: 4000, netVolume: -400, netValue: -4000, avgBuyPrice: 0, avgSellPrice: 1000 },
      { brokerCode: 'XC', buyVolume: 0, buyValue: 0, sellVolume: 300, sellValue: 3000, netVolume: -300, netValue: -3000, avgBuyPrice: 0, avgSellPrice: 1000 },
      { brokerCode: 'PD', buyVolume: 0, buyValue: 0, sellVolume: 200, sellValue: 2000, netVolume: -200, netValue: -2000, avgBuyPrice: 0, avgSellPrice: 1000 },
    ];

    const res = calculateSegmentation(entries);
    assert.equal(res.foreignNetValue, 8000);
    assert.equal(res.domesticInstNetValue, 2000);
    assert.equal(res.retailNetValue, -9000);
    // Institutional net = 8000 + 2000 = 10000. Retail net sell = 9000.
    // Ratio = 10000 / 9000 = 1.1111
    assert.ok(res.institutionToRetailAbsorptionRatio > 1.1);
    assert.equal(res.predominantBuyerTier, 'FOREIGN_CUSTODIAN');
    assert.equal(res.predominantSellerTier, 'RETAIL');
    assert.equal(res.isInstitutionalAbsorption, true);
  });

  it('rejects absorption when retail is buying and foreign is selling', () => {
    const entries: BrokerSummaryEntry[] = [
      { brokerCode: 'YP', buyVolume: 500, buyValue: 5000, sellVolume: 0, sellValue: 0, netVolume: 500, netValue: 5000, avgBuyPrice: 1000, avgSellPrice: 0 },
      { brokerCode: 'AK', buyVolume: 0, buyValue: 0, sellVolume: 500, sellValue: 5000, netVolume: -500, netValue: -5000, avgBuyPrice: 0, avgSellPrice: 1000 },
    ];

    const res = calculateSegmentation(entries);
    assert.equal(res.predominantBuyerTier, 'RETAIL');
    assert.equal(res.predominantSellerTier, 'FOREIGN_CUSTODIAN');
    assert.equal(res.isInstitutionalAbsorption, false);
  });
});
