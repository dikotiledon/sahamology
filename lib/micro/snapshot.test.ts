import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildMicroSnapshot, safeNumber, isBandarSellerOn } from './snapshot';
import type { MarketDetectorResponse } from '../types';

const detector = (over: Partial<MarketDetectorResponse['data']> = {}): MarketDetectorResponse =>
  ({
    data: {
      bandar_detector: {
        top1: { vol: 10, percent: 10, amount: 100, accdist: 'acc' },
        top3: { vol: 30, percent: 30, amount: 300, accdist: 'acc' },
        top5: { vol: 50, percent: 50, amount: 500, accdist: 'small dist' },
        avg: { vol: 40, percent: 40, amount: 400, accdist: 'dist' },
        total_buyer: 7,
        total_seller: 3,
        number_broker_buysell: 10,
        broker_accdist: 'acc',
        volume: 1000,
        value: 5000,
        average: 10,
      },
      broker_summary: { brokers_buy: [], brokers_sell: [] },
      ...over,
    },
  }) as unknown as MarketDetectorResponse;

describe('safeNumber (P2-D, D8 fail-closed)', () => {
  it('returns null for NaN, Infinity, undefined, and non-numeric strings', () => {
    for (const v of [NaN, Infinity, -Infinity, undefined, null, 'NaN', 'abc', '', {}]) {
      assert.equal(safeNumber(v as unknown), null, `safeNumber(${String(v)}) must be null`);
    }
  });

  it('parses a valid numeric string to a finite number', () => {
    assert.equal(safeNumber('1234.5'), 1234.5);
    assert.equal(safeNumber(42), 42);
  });
});

describe('isBandarSellerOn (D9/D20)', () => {
  it('is true only on an exact code match in brokers_sell', () => {
    const d = detector({
      broker_summary: {
        brokers_buy: [],
        brokers_sell: [{ netbs_broker_code: 'BK' } as never],
      },
    } as never);
    assert.equal(isBandarSellerOn(d as MarketDetectorResponse, 'BK'), true);
  });

  it('is false when the list is present and the code is absent', () => {
    assert.equal(isBandarSellerOn(detector() as MarketDetectorResponse, 'BK'), false);
  });

  it('is null when brokers_sell is absent — absence of evidence, not evidence of absence', () => {
    const d = { data: {} } as unknown as MarketDetectorResponse;
    assert.equal(isBandarSellerOn(d as MarketDetectorResponse, 'BK'), null);
  });

  it('is null for a null band code', () => {
    assert.equal(isBandarSellerOn(detector() as MarketDetectorResponse, null), null);
  });
});

describe('buildMicroSnapshot', () => {
  const base = { bandCode: 'BK', priorBandar: ['BK'], flowRow: null, isSeller: false, flowWindow: [] };

  it('maps the detector block into raw values', () => {
    const s = buildMicroSnapshot({ marketDetector: detector(), ...base });
    assert.ok(s.raw);
    assert.equal(s.raw!.accdistOverall, 'acc');
    assert.equal(s.raw!.accdistTop1, 'acc');
    assert.equal(s.raw!.accdistTop5, 'small dist');
    assert.equal(s.raw!.accdistAvg, 'dist');
    assert.equal(s.raw!.brokerTotalBuyer, 7);
    assert.equal(s.raw!.brokerTotalSeller, 3);
  });

  it('derives the acc/dist state and tier', () => {
    const s = buildMicroSnapshot({ marketDetector: detector(), ...base });
    assert.equal(s.accdistState, 'ACC');
    assert.equal(s.tier, 'building');
  });

  it('raw is null when bandar_detector is absent, and never throws', () => {
    const d = { data: { broker_summary: { brokers_buy: [], brokers_sell: [] } } } as unknown as MarketDetectorResponse;
    const s = buildMicroSnapshot({ marketDetector: d, ...base });
    assert.equal(s.raw, null);
    assert.equal(s.accdistState, 'UNKNOWN');
  });

  it('survives a fully malformed detector without throwing', () => {
    for (const bad of [null, undefined, {}, { data: null }, { data: {} }, 'nonsense', 42]) {
      const s = buildMicroSnapshot({ marketDetector: bad as unknown as MarketDetectorResponse, ...base });
      assert.equal(s.raw, null, 'malformed detector must degrade to null');
    }
  });

  it('marks captureIncomplete when raw or flow is missing (D18)', () => {
    const d = { data: { broker_summary: { brokers_buy: [], brokers_sell: [] } } } as unknown as MarketDetectorResponse;
    const noRaw = buildMicroSnapshot({ marketDetector: d, ...base });
    assert.equal(noRaw.captureIncomplete, true);

    const noFlow = buildMicroSnapshot({ marketDetector: detector(), ...base });
    assert.equal(noFlow.captureIncomplete, true, 'flow null must be repairable');

    const complete = buildMicroSnapshot({
      marketDetector: detector(),
      ...base,
      flowRow: { netValue: 1, buyDays: 1, activeDays: 1, consistencyPct: 100 },
    });
    assert.equal(complete.captureIncomplete, false, 'a complete capture is not repairable');
  });

  it('flow is NOT_EVALUATED on a spike even with a row (D9), and the snapshot says so', () => {
    const s = buildMicroSnapshot({
      marketDetector: detector(),
      bandCode: 'BK',
      priorBandar: [],
      flowRow: { netValue: -5, buyDays: 0, activeDays: 5, consistencyPct: 0 },
      isSeller: true,
      flowWindow: [],
    });
    assert.equal(s.tier, 'spike');
    assert.equal(s.flowState, 'NOT_EVALUATED');
  });

  it('flow is bad only with the seller cross-check', () => {
    const row = { netValue: -5, buyDays: 0, activeDays: 5, consistencyPct: 0 };
    assert.equal(
      buildMicroSnapshot({ marketDetector: detector(), ...base, flowRow: row, isSeller: true }).flowState,
      'bad',
    );
    assert.equal(
      buildMicroSnapshot({ marketDetector: detector(), ...base, flowRow: row, isSeller: false }).flowState,
      'neutral',
    );
  });

  it('tier is null when the band code is null', () => {
    const s = buildMicroSnapshot({ marketDetector: detector(), ...base, bandCode: null });
    assert.equal(s.tier, null);
    assert.equal(s.flowState, 'NOT_EVALUATED');
  });
});
