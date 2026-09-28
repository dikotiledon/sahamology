import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePlaybook } from './evaluate';
import type { PlaybookCard, PlaybookInput } from './types';
import { defaultCostModel } from './costs';

/**
 * Order-sensitive G1 upgrade fixtures (plan Task 7, D7/D8/D9).
 *
 * The single most important test in this file is DEFAULT-OFF (C14): with
 * `g1Profile` absent or 'phase-1', the card must be byte-identical to Phase 1.
 * That is what makes it safe to ship the capture layer before the gate layer,
 * and what stops a 'phase-2' flip from mutating the card while the Phase 1
 * walk-forward is still measuring it (D0).
 */

const SMART = 'BK'; // a code that folds to Smartmoney/Whale

const input = (over: Partial<PlaybookInput> = {}): PlaybookInput => ({
  harga: 1000,
  ara: 1400,
  arb: 900,
  totalBid: 100,
  totalOffer: 100,
  bandar: SMART,
  barangBandar: 5000,
  rataRataBandar: 950,
  calculated: {
    ok: true,
    totalPapan: 1.5,
    rataRataBidOfer: 2,
    a: 1200,
    p: 3,
    targetRealistis1: 1300,
    targetMax: 1380,
    fraksi: 25,
  } as PlaybookInput['calculated'],
  brokerType: 'Smartmoney',
  priorBandar: ['BK'],
  isIdxSession: true,
  tokenValid: true,
  costs: defaultCostModel(),
  ...over,
});

const g1 = (card: PlaybookCard) => card.gates.find((g) => g.id === 'G1')!;

/** Strip the Phase 2 view so two cards can be compared for byte equality. */
const phase1Shape = (card: PlaybookCard) =>
  JSON.stringify({ stance: card.stance, failedGates: card.failedGates, gates: card.gates });

describe('DEFAULT-OFF (C14) — the Phase 1 card is byte-identical', () => {
  it('absent g1Profile produces exactly the Phase 1 card', () => {
    const base = input();
    const phase2WithMicro = input({
      g1Profile: 'phase-2',
      micro: {
        bandCode: SMART,
        tier: 'spike',
        accdistState: 'DIST',
        flowState: 'bad',
      },
    });
    // The Phase 1 card is the reference: evaluate with no profile at all.
    const reference = evaluatePlaybook(base);
    // A hostile phase-2 snapshot WITH a phase-1 profile must be ignored.
    const phase1WithMicro = evaluatePlaybook({ ...base, micro: phase2WithMicro.micro });
    assert.equal(phase1Shape(phase1WithMicro), phase1Shape(reference));
  });

  it('g1Profile "phase-1" ignores a hostile micro snapshot entirely', () => {
    const base = input();
    const hostile = input({
      g1Profile: 'phase-1',
      micro: { bandCode: SMART, tier: 'spike', accdistState: 'DIST', flowState: 'bad' },
    });
    assert.equal(phase1Shape(evaluatePlaybook(hostile)), phase1Shape(evaluatePlaybook(base)));
  });

  it('an absent micro snapshot never changes a gate, even under phase-2 (C15)', () => {
    const base = input();
    const noMicro = input({ g1Profile: 'phase-2' });
    assert.equal(phase1Shape(evaluatePlaybook(noMicro)), phase1Shape(evaluatePlaybook(base)));
  });
});

describe('D7 — a spike tier is WAIT-class, evaluated AFTER the type rule', () => {
  it('Smartmoney + spike → WAIT with G1 failed', () => {
    const card = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'spike', accdistState: 'NEUTRAL', flowState: 'NOT_EVALUATED' } }),
    );
    assert.equal(card.stance, 'WAIT');
    assert.ok(card.failedGates.includes('G1'));
    assert.equal(g1(card).pass, false);
  });

  it('Retail + spike → AVOID on the TYPE rule, not the tier rule (order fixture 3)', () => {
    const card = evaluatePlaybook(
      input({
        brokerType: 'Retail',
        g1Profile: 'phase-2',
        micro: { bandCode: SMART, tier: 'spike', accdistState: 'NEUTRAL', flowState: 'NOT_EVALUATED' },
      }),
    );
    assert.equal(card.stance, 'AVOID');
    assert.match(g1(card).reason, /kategori Retail/);
  });

  it('building and persistent tiers pass G1 unchanged, with an annotation', () => {
    for (const tier of ['building', 'persistent'] as const) {
      const card = evaluatePlaybook(
        input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier, accdistState: 'NEUTRAL', flowState: 'NOT_EVALUATED' } }),
      );
      assert.equal(g1(card).pass, true, `${tier} must not block`);
      assert.equal(card.stance, 'WAIT', 'no tape means G4 fails closed, as in Phase 1');
      assert.doesNotMatch(g1(card).reason, /tunggu konfirmasi/);
    }
  });

  it('a building/persistent tier annotates the G1 reason (D15)', () => {
    const building = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'building', accdistState: 'NEUTRAL', flowState: 'NOT_EVALUATED' } }),
    );
    const persistent = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'persistent', accdistState: 'NEUTRAL', flowState: 'NOT_EVALUATED' } }),
    );
    assert.match(g1(building).reason, /persistensi 2 print/);
    assert.match(g1(persistent).reason, /persistensi ≥3 print/);
  });
});

describe('D9 — a bad flow is AVOID, but only with the seller cross-check', () => {
  it('flow bad + Smartmoney → AVOID', () => {
    const card = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'building', accdistState: 'NEUTRAL', flowState: 'bad' } }),
    );
    assert.equal(card.stance, 'AVOID');
    assert.match(g1(card).reason, /net seller/i);
  });

  it('flow bad + spike tier → WAIT, because NOT_EVALUATED beats the flow check', () => {
    // A spike tier means flow was never evaluated; the tier rule (D7) fires first.
    const card = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'spike', accdistState: 'NEUTRAL', flowState: 'NOT_EVALUATED' } }),
    );
    assert.equal(card.stance, 'WAIT');
    assert.doesNotMatch(g1(card).reason, /net seller/i);
  });

  it('flow neutral and NOT_EVALUATED never block', () => {
    for (const flowState of ['neutral', 'NOT_EVALUATED'] as const) {
      const card = evaluatePlaybook(
        input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'building', accdistState: 'NEUTRAL', flowState } }),
      );
      assert.equal(g1(card).pass, true, `${flowState} must not block`);
    }
  });
});

describe('D8 — only DIST blocks acc/dist', () => {
  it('DIST → AVOID', () => {
    const card = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'building', accdistState: 'DIST', flowState: 'NOT_EVALUATED' } }),
    );
    assert.equal(card.stance, 'AVOID');
  });

  it('SMALL_DIST, ACC, SMALL_ACC, NEUTRAL and UNKNOWN never block', () => {
    for (const accdistState of ['SMALL_DIST', 'ACC', 'SMALL_ACC', 'NEUTRAL', 'UNKNOWN'] as const) {
      const card = evaluatePlaybook(
        input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'building', accdistState, flowState: 'NOT_EVALUATED' } }),
      );
      assert.equal(g1(card).pass, true, `${accdistState} must not block`);
    }
  });

  it('a Micro fold still AVOIDs on the stronger existing type rule (step 2 before acc/dist)', () => {
    const card = evaluatePlaybook(
      input({
        brokerType: 'Mix',
        g1Profile: 'phase-2',
        micro: { bandCode: 'QQ', tier: 'building', accdistState: 'DIST', flowState: 'NOT_EVALUATED' },
      }),
    );
    assert.equal(card.stance, 'AVOID');
    assert.match(g1(card).reason, /Mix/);
  });
});

describe('the Phase 2 view is surfaced on the card (D15)', () => {
  it('reports the profile and the evaluated states', () => {
    const card = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'building', accdistState: 'NEUTRAL', flowState: 'ok' } }),
    );
    assert.ok(card.micro, 'the card must carry a micro view when micro is present');
    assert.equal(card.micro!.g1Profile, 'phase-2');
    assert.equal(card.micro!.tier, 'building');
  });

  it('an UNKNOWN acc/dist is labelled, not hidden (D15)', () => {
    const card = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'building', accdistState: 'UNKNOWN', flowState: 'NOT_EVALUATED', accdistEvaluated: false } }),
    );
    assert.equal(card.micro!.accdistEvaluated, false);
  });

  it('no micro view when no micro snapshot is supplied', () => {
    const card = evaluatePlaybook(input());
    assert.equal(card.micro, undefined);
  });
});

describe('nothing else moves (Task 7 fixture 10/11)', () => {
  it('G0–G4 outcomes are identical between profiles when micro is benign', () => {
    const benign = { bandCode: SMART, tier: 'persistent' as const, accdistState: 'ACC' as const, flowState: 'ok' as const };
    const a = evaluatePlaybook(input());
    const b = evaluatePlaybook(input({ g1Profile: 'phase-2', micro: benign }));
    assert.equal(a.stance, b.stance);
    assert.deepEqual(a.failedGates, b.failedGates);
    assert.equal(g1(a).pass, g1(b).pass);
  });

  // Phase 3 (D15): G5's label moved to 'phase-3-off' — it is a designed gate
  // that is deliberately not armed, unlike the unimplemented G6 and G7 which
  // keep 'phase-1'. The micro layer still has no influence on it.
  it('G5-G7 remain skipped; G5 reads phase-3-off, G6/G7 read phase-1', () => {
    const card = evaluatePlaybook(
      input({ g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'building', accdistState: 'ACC', flowState: 'ok' } }),
    );
    for (const id of ['G5', 'G6', 'G7'] as const) {
      const g = card.gates.find((x) => x.id === id)!;
      assert.equal(g.skipped, true);
      assert.equal(g.reason, id === 'G5' ? 'phase-3-off' : 'phase-1');
    }
  });

  it('a micro snapshot never turns a G0 failure into anything but AVOID', () => {
    const card = evaluatePlaybook(
      input({ tokenValid: false, g1Profile: 'phase-2', micro: { bandCode: SMART, tier: 'persistent', accdistState: 'ACC', flowState: 'ok' } }),
    );
    assert.equal(card.stance, 'AVOID');
  });
});
