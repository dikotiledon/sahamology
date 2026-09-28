import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  flowState,
  FLOW_WINDOW,
  FLOW_CONSISTENCY_FLOOR,
  FLOW_MIN_ACTIVE_DAYS,
} from './flow';
import type { BrokerFlowRow } from './types';

const row = (over: Partial<BrokerFlowRow> = {}): BrokerFlowRow => ({
  netValue: 1_000,
  buyDays: 4,
  activeDays: 5,
  consistencyPct: 80,
  ...over,
});

describe('frozen flow constants (D5)', () => {
  it('are exactly 5 / 60 / 3 and must not drift', () => {
    assert.equal(FLOW_WINDOW, 5);
    assert.equal(FLOW_CONSISTENCY_FLOOR, 60);
    assert.equal(FLOW_MIN_ACTIVE_DAYS, 3);
  });
});

describe('flowState (D9)', () => {
  it('is NOT_EVALUATED on a spike tier even when a row is supplied', () => {
    assert.equal(flowState({ tier: 'spike', row: row(), isSeller: false }), 'NOT_EVALUATED');
  });

  it('is NOT_EVALUATED when the tier is null (G1 already blocked)', () => {
    assert.equal(flowState({ tier: null, row: row(), isSeller: false }), 'NOT_EVALUATED');
  });

  it('is NOT_EVALUATED when the row is missing — a coverage miss, not a verdict', () => {
    assert.equal(flowState({ tier: 'building', row: null, isSeller: null }), 'NOT_EVALUATED');
    assert.equal(flowState({ tier: 'persistent', row: null, isSeller: null }), 'NOT_EVALUATED');
  });

  it('is bad only when netValue<0 AND the code sold that session (D9 seller cross-check)', () => {
    assert.equal(
      flowState({ tier: 'building', row: row({ netValue: -1 }), isSeller: true }),
      'bad',
    );
  });

  it('is neutral on netValue<0 when the broker is not in brokers_sell', () => {
    assert.equal(flowState({ tier: 'building', row: row({ netValue: -1 }), isSeller: false }), 'neutral');
    assert.equal(flowState({ tier: 'building', row: row({ netValue: -1 }), isSeller: null }), 'neutral');
  });

  it('is ok at the exact floor: netValue>0, activeDays=3, consistency=60', () => {
    assert.equal(
      flowState({
        tier: 'building',
        row: row({ netValue: 1, activeDays: 3, consistencyPct: 60 }),
        isSeller: false,
      }),
      'ok',
    );
  });

  it('is neutral one unit below either floor (D5, no tolerance)', () => {
    assert.equal(
      flowState({ tier: 'building', row: row({ activeDays: 2, consistencyPct: 100 }), isSeller: false }),
      'neutral',
      'activeDays below the floor',
    );
    assert.equal(
      flowState({ tier: 'building', row: row({ activeDays: 5, consistencyPct: 59 }), isSeller: false }),
      'neutral',
      'consistency below the floor',
    );
  });

  it('netValue exactly 0 is neutral, never ok and never bad', () => {
    assert.equal(flowState({ tier: 'building', row: row({ netValue: 0 }), isSeller: true }), 'neutral');
    assert.equal(flowState({ tier: 'building', row: row({ netValue: 0 }), isSeller: false }), 'neutral');
  });

  it('a positive row still requires the active/consistency floors', () => {
    assert.equal(
      flowState({ tier: 'building', row: row({ activeDays: 1, consistencyPct: 100 }), isSeller: false }),
      'neutral',
    );
  });
});
