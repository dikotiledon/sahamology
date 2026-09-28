import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildReplayInput, buildReplayMicro, type SignalRow } from './replay';
import { buildJournalPayload } from './journal-payload';
import { defaultCostModel, roundTripCostRate } from './costs';
import type { MicroInput } from './types';

/**
 * D12 + M10: a signal without micro inputs is UNSCORED for system (3), never
 * defaulted. That is the whole point — a pre-Phase-2 row has no acc/dist and
 * no flow row, and pretending it does would fabricate the entire experiment.
 */

const signal = (over: Partial<SignalRow> = {}): SignalRow => ({
  emiten: 'BBCA',
  from_date: '2026-03-10',
  harga: 1000,
  ara: 1400,
  arb: 900,
  total_bid: 100,
  total_offer: 100,
  bandar: 'BK',
  barang_bandar: 5000,
  rata_rata_bandar: 950,
  target_realistis: 1300,
  target_max: 1380,
  ...over,
});

describe('D12 — a pre-Phase-2 signal is unscored for system (3), never defaulted', () => {
  it('returns null micro when the acc/dist columns are absent', () => {
    const micro = buildReplayMicro(signal({}), []);
    assert.equal(micro, null, 'no acc/dist columns means no micro, not a default ACC');
  });

  it('returns null micro when the row is marked capture_incomplete (D18)', () => {
    const micro = buildReplayMicro(signal({ accdist_overall: 'acc', capture_incomplete: true }), []);
    assert.equal(micro, null, 'an unrepaired degraded row is unscored, not partially trusted');
  });

  it('returns null micro when there is no flow row for the band', () => {
    const micro = buildReplayMicro(signal({ accdist_overall: 'acc' }), []);
    assert.equal(micro, null, 'acc/dist alone is not enough — flow is part of the treatment');
  });

  it('builds a full micro only when every input is present', () => {
    const micro = buildReplayMicro(
      signal({ accdist_overall: 'acc' }),
      [{ netValue: 100, buyDays: 4, activeDays: 5, consistencyPct: 80 }],
    );
    assert.ok(micro);
    assert.equal(micro!.accdistState, 'ACC');
    assert.equal(micro!.tier, 'spike');
    assert.equal(micro!.flowState, 'NOT_EVALUATED', 'a spike tier is never flow-evaluated');
  });

  it('a building tier with a positive flow row yields flow ok', () => {
    const micro = buildReplayMicro(
      signal({ accdist_overall: 'acc' }),
      [{ netValue: 100, buyDays: 4, activeDays: 5, consistencyPct: 80 }],
      { bandCode: 'BK', priorBandar: ['BK'] },
    );
    assert.ok(micro);
    assert.equal(micro!.tier, 'building');
    assert.equal(micro!.flowState, 'ok');
  });
});

describe('buildReplayInput carries g1Profile and micro (M10)', () => {
  it('returns null for a row missing book columns, unchanged from Phase 1', () => {
    assert.equal(buildReplayInput(signal({ total_bid: null }), []), null);
    assert.equal(buildReplayInput(signal({ arb: 0 }), []), null);
    assert.equal(buildReplayInput(signal({ bandar: '' }), []), null);
  });

  it('passes g1Profile and micro through unchanged', () => {
    const micro: MicroInput = { bandCode: 'BK', tier: 'building', accdistState: 'ACC', flowState: 'ok' };
    const input = buildReplayInput(signal({}), [], { g1Profile: 'phase-2', micro });
    assert.ok(input);
    assert.equal(input!.g1Profile, 'phase-2');
    assert.deepEqual(input!.micro, micro);
  });

  it('an absent options object leaves g1Profile and micro undefined (byte-equality)', () => {
    const input = buildReplayInput(signal({}), []);
    assert.ok(input);
    assert.equal(input!.g1Profile, undefined);
    assert.equal(input!.micro, undefined);
    assert.equal(roundTripCostRate(input!.costs), roundTripCostRate(defaultCostModel()));
  });
});

describe('journal payload records the micro state that produced the stance (C17)', () => {
  it('carries machine keys for the micro view on the G1 gate row', () => {
    const payload = buildJournalPayload('BBCA', '2026-03-10', {
      stance: 'WAIT',
      gates: [{ id: 'G1', pass: true, reason: 'Akumulator BK berkategori Smartmoney' }],
      entry: 1000, r1: 1300, max: 1400, invalidation: 900, rr: 2,
      thesis: 'x', failedGates: [],
      micro: {
        g1Profile: 'phase-2',
        bandCode: 'BK',
        tier: 'building',
        accdistState: 'ACC',
        accdistEvaluated: true,
        flowState: 'ok',
      },
    } as never);
    const g1 = (payload.gates as Array<Record<string, unknown>>).find((g) => g.id === 'G1')!;
    const micro = g1.micro as Record<string, unknown>;
    assert.ok(micro, 'the micro view must be journaled so the stance can be replayed');
    assert.equal(micro.tier, 'building');
    assert.equal(micro.accdistState, 'ACC');
    assert.equal(micro.flowState, 'ok');
    assert.equal(micro.g1Profile, 'phase-2');
  });

  it('omits the micro key entirely when the card has no micro view (byte-equality)', () => {
    const payload = buildJournalPayload('BBCA', '2026-03-10', {
      stance: 'WAIT',
      gates: [{ id: 'G1', pass: true, reason: 'x' }],
      entry: null, r1: null, max: null, invalidation: null, rr: null,
      thesis: 'x', failedGates: [],
    } as never);
    const g1 = (payload.gates as Array<Record<string, unknown>>).find((g) => g.id === 'G1')!;
    assert.equal('micro' in g1, false, 'no micro key at all, so existing rows serialize identically');
  });
});
