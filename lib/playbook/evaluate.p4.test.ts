import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePlaybook } from './evaluate';
import type { PlaybookCard, PlaybookInput, Stance } from './types';
import type { TapeSnapshot } from '../tape/snapshot';
import { defaultCostModel } from './costs';
import type { CalculateTargetsOk, CalculateTargetsResult } from '../calculations';
import {
  REGIME_REASON,
  type MacroClause,
  type MacroInput,
  type MacroState,
} from '../macro/types';
import { FUNDAMENTAL_REASON, type FundamentalInput } from '../fundamentals/types';

/**
 * Leaf 1.3.1 — the G7 evaluator slice.
 *
 * G7 is a SINGLE-NOTCH HOLD. Every assertion below is about the size of the
 * notch, because that is the one property a test cannot take on faith:
 *
 *   D3  A CAUTION regime can only turn ENTER into WAIT. It can never CREATE an
 *       ENTER, never soften an existing WAIT, and never reach AVOID. The
 *       strongest form of this is a SWEEP: no combination of G0–G6 outcomes and
 *       no regime state may produce an AVOID or an ENTER that G7 caused.
 *   D4  G7 is evaluated last. An earlier gate's failure means G7 is skipped, so
 *       the card never blames the macro backdrop for a technical rejection.
 *   D11 G7 FAILS OPEN. Absent, unmeasured or out-of-scope data yields
 *       NOT_EVALUATED and a passing row — the same reasoning as G5, and the
 *       deliberate opposite of G4.
 *
 * Default-off is what makes shipping the capture and classification layers
 * before any threshold is measured safe: with `g7Profile` absent the card must
 * be byte-identical to Phase 3.
 */

const SMART = 'BK';

const okCalcBase = {
  ok: true,
  totalPapan: 18,
  rataRataBidOfer: 111,
  a: 1050,
  p: 5,
  targetRealistis1: 1120,
  targetMax: 1250,
  fraksi: 25,
} as const satisfies CalculateTargetsOk;

/**
 * A healthy trend. Without it G4 fails CLOSED and the fixture lands on WAIT,
 * which would make every G7 assertion below vacuous.
 */
const tape = (over: Partial<TapeSnapshot> = {}): TapeSnapshot => ({
  ok: true,
  reason: 'Tape valid',
  asOf: '2026-09-24',
  barsUsed: 25,
  atr: 20,
  ema20: 990,
  ema20Prev: 985,
  trendOk: true,
  pattern: null,
  completedDate: '2026-09-24',
  ...over,
});

const input = (over: Partial<PlaybookInput> = {}): PlaybookInput => ({
  harga: 1000,
  ara: 1400,
  arb: 950,
  totalBid: 1000,
  totalOffer: 1000,
  bandar: SMART,
  barangBandar: 10_000_000,
  rataRataBandar: 980,
  calculated: okCalcBase,
  brokerType: 'Smartmoney',
  priorBandar: [SMART, SMART],
  isIdxSession: true,
  tokenValid: true,
  costs: defaultCostModel(),
  tape: tape(),
  ...over,
});

const macro = (over: Partial<MacroInput> = {}): MacroInput => ({
  state: 'NEUTRAL' as MacroState,
  clauses: [] as MacroClause[],
  reason: REGIME_REASON.NO_THRESHOLD_FIRED,
  evaluated: ['IHSG', 'USDIDR'],
  sectorUnmapped: false,
  ...over,
});

const caution = (clauses: MacroClause[] = ['IHSG_BROAD_WEAKNESS']): MacroInput =>
  macro({ state: 'CAUTION', clauses, reason: REGIME_REASON.THRESHOLD_FIRED });

/** A fully-typed healthy calc, so a weakened-RR variant stays in the Ok union. */
const okCalc = (r1 = 1120): CalculateTargetsResult =>
  okCalcBase.ok
    ? { ...okCalcBase, targetRealistis1: r1 }
    : (() => {
        throw new Error('okCalcBase is not an Ok result');
      })();

const g7 = (card: PlaybookCard) => card.gates.find((g) => g.id === 'G7')!;

/**
 * The comparable shape of a card: stance, failedGates and the gate rows.
 *
 * The recorded views (`micro`, `fundamental`, `macro`) are excluded on
 * purpose, and so is `thesis`. A view is present whenever a reading was
 * SUPPLIED, whatever the profile — that is D15, and it is the whole point: an
 * operator must be able to see that a reading exists and that its gate is not
 * armed. Byte-identity is therefore a claim about the decision (stance,
 * failures, gate rows), which is what default-off has to protect. `thesis` is
 * excluded for the same reason p3 excludes it: the ENTER line deliberately
 * NAMES which gates ran, so it changes when a profile is armed even though the
 * decision does not.
 */
const shape = (card: PlaybookCard): string =>
  JSON.stringify({ stance: card.stance, failedGates: card.failedGates, gates: card.gates });

describe('G7 default-off — the Phase 3 card is byte-identical', () => {
  it('absent g7Profile produces exactly the reference card, even with a CAUTION regime', () => {
    const base = input();
    const reference = evaluatePlaybook(base);
    const withRegime = evaluatePlaybook({ ...base, g7Profile: undefined, macro: caution() });
    assert.equal(withRegime.stance, 'ENTER');
    assert.deepEqual(shape(withRegime), shape(reference));
  });

  it("g7Profile 'off' ignores a CAUTION regime entirely", () => {
    const card = evaluatePlaybook(input({ g7Profile: 'off', macro: caution() }));
    assert.equal(card.stance, 'ENTER');
    assert.equal(g7(card).pass, true);
    assert.equal(g7(card).skipped, true);
    assert.equal(g7(card).reason, 'phase-4-off');
  });

  it("'off' alone is byte-identical, including the gate row", () => {
    const base = input();
    assert.equal(shape(evaluatePlaybook({ ...base, g7Profile: 'off' })), shape(evaluatePlaybook(base)));
  });

  it('a missing macro block never changes the stance under any profile', () => {
    for (const g7Profile of ['off', 'visible', 'veto'] as const) {
      assert.equal(
        evaluatePlaybook(input({ g7Profile })).stance,
        'ENTER',
        `profile ${g7Profile} needed a macro block to stay ENTER`,
      );
    }
  });

  it('is independent of g5Profile — neither gate can move the other', () => {
    const sound: FundamentalInput = {
      state: 'SOUND',
      clauses: [],
      isFinancialIssuer: false,
      reason: FUNDAMENTAL_REASON.NO_VETO_CLAUSE_FIRED,
    };
    const g5 = (card: PlaybookCard) => card.gates.find((g) => g.id === 'G5')!;

    // A SOUND fundamental under 'veto' must not change what G7 does.
    const withG5 = evaluatePlaybook(
      input({ g7Profile: 'veto', macro: caution(), g5Profile: 'veto', fundamental: sound }),
    );
    assert.equal(withG5.stance, 'WAIT');
    assert.equal(g5(withG5).pass, true);
    assert.deepEqual(withG5.failedGates, ['G7']);

    // And a CAUTION regime must not change what G5 does: with the regime
    // removed the card is the same G7-alone decision.
    const g5Only = evaluatePlaybook(input({ g7Profile: 'veto', macro: macro(), g5Profile: 'veto' }));
    assert.equal(g5Only.stance, 'ENTER');
  });
});

describe('G7 reports without acting under the visible profile', () => {
  it("shows a CAUTION but keeps the stance at ENTER under g7Profile 'visible'", () => {
    const card = evaluatePlaybook(input({ g7Profile: 'visible', macro: caution() }));
    assert.equal(card.stance, 'ENTER');
    assert.deepEqual(card.failedGates, []);
    // The row still records the finding, so the operator can see it coming.
    assert.equal(g7(card).pass, false);
    assert.match(g7(card).reason, /IHSG_BROAD_WEAKNESS/);
  });

  it('does not let a visible CAUTION leak into the thesis', () => {
    const card = evaluatePlaybook(input({ g7Profile: 'visible', macro: caution() }));
    assert.doesNotMatch(card.thesis, /IHSG_BROAD_WEAKNESS/);
  });
});

describe('G7 veto — exactly one notch, ENTER to WAIT', () => {
  it("downgrades an ENTER to WAIT under g7Profile 'veto' with a CAUTION", () => {
    const card = evaluatePlaybook(input({ g7Profile: 'veto', macro: caution() }));
    assert.equal(card.stance, 'WAIT');
    assert.equal(g7(card).pass, false);
    assert.deepEqual(card.failedGates, ['G7']);
  });

  it('NEVER reaches AVOID, whatever the clause set', () => {
    const all: MacroClause[] = [
      'IHSG_BROAD_WEAKNESS',
      'USD_IDR_DETERIORATING',
      'SECTOR_COMMODITY_ADVERSE',
    ];
    const sets: MacroClause[][] = [[], ['IHSG_BROAD_WEAKNESS'], all];
    for (const clauses of sets) {
      const card = evaluatePlaybook(input({ g7Profile: 'veto', macro: caution(clauses) }));
      assert.equal(card.stance, 'WAIT', `clauses ${clauses.join()} escaped the single notch`);
    }
  });

  it('never softens an existing WAIT — a CAUTION changes nothing but the reason', () => {
    // A setup that already fails G3 (R:R below 1.5) is WAIT on its own merit.
    const weak = input({
      g7Profile: 'veto',
      macro: caution(),
      calculated: okCalc(1010),
    });
    const withRegime = evaluatePlaybook(weak);
    assert.equal(withRegime.stance, 'WAIT');
    // The G7 row is skipped, so the card cites G3 and not the macro backdrop.
    assert.equal(g7(withRegime).skipped, true);
    assert.equal(g7(withRegime).reason, 'Dilewati karena gate sebelumnya gagal');
    assert.match(withRegime.thesis, /^G3:/);
    assert.doesNotMatch(withRegime.thesis, /G7/);
  });

  it('never rescues an existing AVOID', () => {
    const avoided = evaluatePlaybook(input({ g7Profile: 'veto', macro: macro(), tokenValid: false }));
    assert.equal(avoided.stance, 'AVOID');
    assert.deepEqual(avoided.failedGates, ['G0']);
  });

  it('never creates an ENTER — with a SUPPORTIVE or NEUTRAL regime', () => {
    for (const state of ['SUPPORTIVE', 'NEUTRAL'] as const) {
      const card = evaluatePlaybook(input({ g7Profile: 'veto', macro: macro({ state }) }));
      assert.equal(card.stance, 'ENTER', `${state} did not pass`);
      assert.deepEqual(card.failedGates, []);
    }
  });

  it('is skipped when an earlier gate already failed, so a tape failure is not blamed on macro', () => {
    const card = evaluatePlaybook(
      input({ g7Profile: 'veto', macro: caution(), tape: tape({ ok: false, reason: 'Tape kosong' }) }),
    );
    assert.equal(card.stance, 'WAIT');
    assert.equal(g7(card).skipped, true);
    assert.deepEqual(card.failedGates, ['G4']);
  });
});

describe('G7 fails open — absence of evidence is never a warning', () => {
  const unmeasured: MacroInput[] = [
    macro({ state: 'NOT_EVALUATED', reason: REGIME_REASON.NO_SNAPSHOT }),
    macro({ state: 'NOT_EVALUATED', reason: REGIME_REASON.INSUFFICIENT_HISTORY }),
    macro({ state: 'NOT_EVALUATED', reason: REGIME_REASON.SECTOR_UNMAPPED }),
  ];

  for (const g7Profile of ['visible', 'veto'] as const) {
    for (const reading of unmeasured) {
      it(`passes open under '${g7Profile}' for ${reading.reason}`, () => {
        const card = evaluatePlaybook(input({ g7Profile, macro: reading }));
        assert.equal(card.stance, 'ENTER');
        assert.equal(g7(card).pass, true);
        assert.equal(g7(card).skipped, undefined);
      });
    }
  }

  it('a NOT_EVALUATED regime can never carry clauses', () => {
    // The classifier cannot produce this, but the evaluator must not trust the
    // caller: a NOT_EVALUATED reading that somehow lists clauses is still inert.
    const card = evaluatePlaybook(
      input({
        g7Profile: 'veto',
        macro: macro({
          state: 'NOT_EVALUATED',
          clauses: ['IHSG_BROAD_WEAKNESS'],
          reason: REGIME_REASON.NO_SNAPSHOT,
        }),
      }),
    );
    assert.equal(card.stance, 'ENTER');
  });
});

describe('G7 stance sweep — the single notch holds across every G0–G6 outcome', () => {
  /**
   * The strongest form of D3. For each way an earlier gate can reject a setup,
   * assert that the stance is identical with and without a CAUTION regime, and
   * that the armed regime never produces a stance worse than WAIT.
   */
  const earlierFailures: ReadonlyArray<[string, Partial<PlaybookInput>, Stance]> = [
    ['G0 bad calc', { calculated: { ok: false, reason: 'degenerate_book' } }, 'AVOID'],
    ['G0 not an IDX session', { isIdxSession: false }, 'AVOID'],
    ['G0 token invalid', { tokenValid: false }, 'AVOID'],
    ['G1 no bandar', { bandar: null }, 'AVOID'],
    ['G1 wrong broker', { brokerType: 'Retail' }, 'AVOID'],
    ['G1 price above R1', { harga: 1200 }, 'WAIT'],
    ['G2 at ARA', { ara: 1000 }, 'WAIT'],
    ['G2 offer stacked', { totalOffer: 9000, totalBid: 1000 }, 'WAIT'],
    ['G3 R:R below 1.5', { calculated: okCalc(1010) }, 'WAIT'],
    ['G4 tape collapsed', { tape: tape({ ok: true, trendOk: false, pattern: null }) }, 'WAIT'],
  ];

  for (const [label, over, expected] of earlierFailures) {
    it(`${label} is unchanged by a CAUTION regime under 'veto'`, () => {
      const base = input(over);
      const without = evaluatePlaybook({ ...base, g7Profile: 'off' });
      const with_ = evaluatePlaybook({ ...base, g7Profile: 'veto', macro: caution() });
      assert.equal(without.stance, expected);
      assert.equal(with_.stance, expected, `G7 changed the ${label} outcome`);
    });
  }

  it('the armed regime changes exactly ONE outcome: a healthy ENTER', () => {
    // The pre-existing AVOIDs are G0/G1 rejections and are correct. What must
    // never appear is an AVOID that G7 CAUSED, and what must never appear is an
    // ENTER that survived an armed CAUTION. The cleanest way to say both: for
    // every fixture, the armed stance equals the unarmed stance, except for the
    // one healthy setup where ENTER becomes WAIT.
    const moved: string[] = [];
    for (const [label, over] of earlierFailures) {
      const base = input(over);
      const unarmed = evaluatePlaybook({ ...base, g7Profile: 'off' }).stance;
      const armed = evaluatePlaybook({ ...base, g7Profile: 'veto', macro: caution() }).stance;
      if (unarmed !== armed) moved.push(`${label}: ${unarmed} -> ${armed}`);
    }
    assert.deepEqual(moved, [], `G7 moved a setup it had no business moving: ${moved.join('; ')}`);

    const healthy = evaluatePlaybook(input({ g7Profile: 'veto', macro: caution() })).stance;
    assert.equal(healthy, 'WAIT', 'the one case G7 is allowed to move did not move');
    assert.ok(!['ENTER', 'AVOID'].includes(healthy), 'G7 left the single notch');
  });
});

describe('the macro view is recorded under every profile', () => {
  it("is present under 'off' — an operator can see the gate exists and is not armed", () => {
    const card = evaluatePlaybook(input({ g7Profile: 'off', macro: caution() }));
    assert.ok(card.macro, 'no macro view on the card');
    assert.equal(card.macro?.g7Profile, 'off');
    assert.equal(card.macro?.state, 'CAUTION');
  });

  it('records the clauses that fired, so the badge can name them', () => {
    const card = evaluatePlaybook(
      input({ g7Profile: 'veto', macro: caution(['USD_IDR_DETERIORATING']) }),
    );
    assert.deepEqual(card.macro?.clauses, ['USD_IDR_DETERIORATING']);
  });

  it('is absent when no reading was supplied, so absence stays distinguishable from NOT_EVALUATED', () => {
    assert.equal(evaluatePlaybook(input({ g7Profile: 'veto' })).macro, undefined);
  });
});
