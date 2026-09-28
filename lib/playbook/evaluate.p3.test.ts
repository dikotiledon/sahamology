import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { evaluatePlaybook } from './evaluate';
import type { PlaybookCard, PlaybookInput } from './types';
import type { TapeSnapshot } from '../tape/snapshot';
import { defaultCostModel } from './costs';
import { parseKeyStatsSeries } from '../fundamentals/keystats-series';
import { classifyFundamentals } from '../fundamentals/rubric';
import { FUNDAMENTAL_REASON, type FundamentalInput } from '../fundamentals/types';

/**
 * Leaf 1.2.1 — the G5 evaluator slice.
 *
 * G5 is a VETO, not a filter that can promote. Three invariants carry the
 * whole design, and each is asserted here against the real calibrated data
 * rather than a hand-picked mock:
 *
 *   D3  G5 can only ever turn ENTER into AVOID. It can never CREATE an ENTER,
 *       and it can never soften a WAIT or AVOID produced by G0–G4.
 *   D4  G5 is evaluated last. An earlier gate's failure means G5 is skipped, so
 *       the card never blames fundamentals for a technical rejection.
 *   D11 G5 FAILS OPEN. Absent, unmeasured or out-of-scope data yields
 *       NOT_EVALUATED and never a veto. G4 fails CLOSED on missing tape; G5
 *       is the deliberate opposite, because a fundamental reading is
 *       supplementary evidence and its absence is not a red flag.
 *
 * Default-off is what makes shipping the capture layer before the gate layer
 * safe: with `g5Profile` absent the card must be byte-identical to Phase 2.
 */

const SMART = 'BK';

/**
 * A healthy trend. Without it G4 fails CLOSED and the fixture lands on WAIT,
 * which would make every G5 assertion below vacuous.
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
  priorBandar: [SMART],
  isIdxSession: true,
  tokenValid: true,
  tape: tape(),
  costs: defaultCostModel(),
  ...over,
});

const g5 = (card: PlaybookCard) => card.gates.find((g) => g.id === 'G5')!;
const shape = (card: PlaybookCard) =>
  JSON.stringify({ stance: card.stance, failedGates: card.failedGates, gates: card.gates });

/** A LANDMINE reading, built through the real parser and rubric. */
const landmine = (): FundamentalInput => {
  const snapshot = parseKeyStatsSeries(
    {
      data: {
        closure_fin_items_results: [
          {
            keystats_name: 'Balance Sheet',
            fin_name_results: [
              { fitem: { id: '1', name: 'Total Equity', value: '-18,252 B' } },
            ],
          },
          {
            keystats_name: 'Solvency',
            fin_name_results: [
              { fitem: { id: '2', name: 'Altman Z-Score (Modified)', value: '-183.50' } },
            ],
          },
        ],
      },
    } as never,
    'POLY',
  );
  return classifyFundamentals(snapshot);
};

const sound = (): FundamentalInput => {
  const snapshot = parseKeyStatsSeries(
    {
      data: {
        closure_fin_items_results: [
          {
            keystats_name: 'Balance Sheet',
            fin_name_results: [
              { fitem: { id: '1', name: 'Total Equity', value: '289,844 B' } },
            ],
          },
          {
            keystats_name: 'Solvency',
            fin_name_results: [
              { fitem: { id: '2', name: 'Altman Z-Score (Modified)', value: '3.28' } },
            ],
          },
        ],
      },
    } as never,
    'ASII',
  );
  return classifyFundamentals(snapshot);
};

describe('G5 default-off — the Phase 2 card is byte-identical', () => {
  it('absent g5Profile produces exactly the reference card, even with a LANDMINE', () => {
    const base = input();
    const reference = evaluatePlaybook(base);
    const hostile = evaluatePlaybook({ ...base, fundamental: landmine() });
    assert.equal(shape(hostile), shape(reference));
  });

  it("g5Profile 'off' ignores a LANDMINE reading entirely", () => {
    const base = input();
    const off = evaluatePlaybook({ ...base, g5Profile: 'off', fundamental: landmine() });
    assert.equal(shape(off), shape(evaluatePlaybook(base)));
  });

  it('a missing fundamental block never changes the STANCE under any profile', () => {
    // Note the scope: the STANCE must be identical, but the gate row is not.
    // Under 'off' the row reads "phase-3-off"; under an armed profile it
    // records that no data was available. That difference is deliberate and
    // informative — it is what lets an operator see the gate is switched on
    // yet had nothing to work with. Asserting byte equality here would forbid
    // the observability the project has been asking for since Phase 0.
    const base = input();
    const reference = evaluatePlaybook(base);
    for (const g5Profile of ['off', 'visible', 'veto'] as const) {
      const card = evaluatePlaybook({ ...base, g5Profile });
      assert.equal(card.stance, reference.stance, `profile ${g5Profile} changed the stance`);
      assert.deepEqual(card.failedGates, reference.failedGates, `${g5Profile} changed failedGates`);
      assert.equal(card.entry, reference.entry);
      assert.equal(card.rr, reference.rr);
    }
  });

  it("'off' alone is byte-identical, including the gate row", () => {
    const base = input();
    assert.equal(
      shape(evaluatePlaybook({ ...base, g5Profile: 'off' })),
      shape(evaluatePlaybook(base)),
    );
  });

  it('is independent of g1Profile — the two profiles never interfere', () => {
    const base = input({ g5Profile: 'veto', fundamental: landmine() });
    const withPhase1 = evaluatePlaybook({ ...base, g1Profile: 'phase-1' });
    const withPhase2 = evaluatePlaybook({ ...base, g1Profile: 'phase-2' });
    // G5 must veto regardless of which micro profile is active.
    assert.equal(withPhase1.stance, 'AVOID');
    assert.equal(withPhase2.stance, 'AVOID');
  });
});

describe('G5 veto — fires only for LANDMINE, only under the veto profile', () => {
  it("vetoes an ENTER to AVOID under g5Profile 'veto'", () => {
    const card = evaluatePlaybook(input({ g5Profile: 'veto', fundamental: landmine() }));
    assert.equal(card.stance, 'AVOID');
    assert.equal(g5(card).pass, false);
    assert.deepEqual(card.failedGates, ['G5']);
  });

  it("does NOT veto under g5Profile 'visible' — score only, stance preserved", () => {
    const base = input();
    const visible = evaluatePlaybook({ ...base, g5Profile: 'visible', fundamental: landmine() });
    assert.equal(visible.stance, 'ENTER');
    // The row still records the finding so the operator can see it coming.
    assert.equal(g5(visible).pass, false);
  });

  it('reports the fired clauses on the gate row', () => {
    const card = evaluatePlaybook(input({ g5Profile: 'veto', fundamental: landmine() }));
    const row = g5(card);
    assert.match(row.reason, /LANDMINE|NEGATIVE_EQUITY|DISTRESS/);
  });

  it('keeps ENTER for a SOUND reading under the veto profile', () => {
    const card = evaluatePlaybook(input({ g5Profile: 'veto', fundamental: sound() }));
    assert.equal(card.stance, 'ENTER');
    assert.equal(g5(card).pass, true);
    assert.ok(!card.failedGates.includes('G5'));
  });
});

describe('G5 fails OPEN — absent data never manufactures a veto (D11)', () => {
  const failOpenCases: Array<[string, FundamentalInput]> = [
    ['no data at all', classifyFundamentals(null)],
    ['empty snapshot', classifyFundamentals({ emiten: 'X', entries: [], isFinancialIssuer: false, currency: null })],
    [
      'all values unavailable',
      classifyFundamentals(
        parseKeyStatsSeries(
          { data: { closure_fin_items_results: [{ keystats_name: 'S', fin_name_results: [{ fitem: { id: '1', name: 'Total Equity', value: '-' } }] }] } } as never,
          'X',
        ),
      ),
    ],
  ];

  for (const [label, fundamental] of failOpenCases) {
    it(`keeps ENTER for ${label}`, () => {
      const card = evaluatePlaybook(input({ g5Profile: 'veto', fundamental }));
      assert.equal(card.stance, 'ENTER', `${label} must not veto`);
      assert.notEqual(fundamental.state, 'LANDMINE');
    });
  }

  it('treats a financial issuer as out of scope, not as a landmine', () => {
    // BBCA measures liabilities/equity 5.14. Without the exclusion this is a
    // false veto on a large, profitable bank — and half the watchlist is banks.
    const bank = parseKeyStatsSeries(
      {
        data: {
          closure_fin_items_results: [
            {
              keystats_name: 'Solvency',
              fin_name_results: [
                { fitem: { id: '1', name: 'Total Liabilities/Equity (Quarter)', value: '5.14' } },
                { fitem: { id: '2', name: 'NPL - Gross', value: '2.90%' } },
              ],
            },
          ],
        },
      } as never,
      'BBCA',
    );
    const fundamental = classifyFundamentals(bank);
    assert.equal(fundamental.isFinancialIssuer, true);
    assert.equal(fundamental.reason, FUNDAMENTAL_REASON.FINANCIAL_ISSUER);

    const card = evaluatePlaybook(input({ g5Profile: 'veto', fundamental }));
    assert.equal(card.stance, 'ENTER');
  });
});

describe('G5 can never CREATE or SOFTEN a stance (D3)', () => {
  it('cannot turn a G2 WAIT into an ENTER', () => {
    const card = evaluatePlaybook(
      input({ g5Profile: 'veto', fundamental: sound(), totalOffer: 500, totalBid: 100 }),
    );
    assert.equal(card.stance, 'WAIT');
    assert.ok(card.failedGates.includes('G2'));
  });

  it('cannot turn a G0 AVOID into an ENTER', () => {
    const card = evaluatePlaybook(
      input({ g5Profile: 'veto', fundamental: sound(), tokenValid: false }),
    );
    assert.equal(card.stance, 'AVOID');
  });

  it('cannot soften a G0 AVOID even when fundamentals are perfectly sound', () => {
    // Compare G5-on against G5-off ON THE SAME blocked setup, so the only
    // variable is the fundamental layer. Comparing against an unblocked
    // reference would assert the difference G0 itself already makes.
    const blocked = input({ tokenValid: false, fundamental: sound() });
    const withG5 = evaluatePlaybook({ ...blocked, g5Profile: 'veto' });
    const withoutG5 = evaluatePlaybook({ ...blocked, g5Profile: 'off' });

    assert.equal(withG5.stance, 'AVOID');
    assert.equal(withG5.stance, withoutG5.stance, 'G5 softened a G0 rejection');
    // And it is skipped, not blamed: the card names G0, not G5.
    assert.deepEqual(withG5.failedGates, withoutG5.failedGates);
    assert.equal(g5(withG5).skipped, true);
  });
});

describe('G5 is evaluated last and is skipped when an earlier gate fails (D4)', () => {
  it('skips G5 when G2 fails, so the card never blames fundamentals', () => {
    const card = evaluatePlaybook(
      input({ g5Profile: 'veto', fundamental: landmine(), totalOffer: 500, totalBid: 100 }),
    );
    const row = g5(card);
    assert.equal(row.skipped, true);
    assert.ok(!card.failedGates.includes('G5'), 'G5 must not be blamed for a G2 rejection');
    assert.equal(card.stance, 'WAIT');
  });

  it('skips G5 when G0 fails', () => {
    const card = evaluatePlaybook(
      input({ g5Profile: 'veto', fundamental: landmine(), tokenValid: false }),
    );
    assert.equal(g5(card).skipped, true);
    assert.ok(!card.failedGates.includes('G5'));
  });

  it('always emits a G5 row, so the gate list shape is stable', () => {
    for (const over of [{}, { g5Profile: 'veto' as const }, { tokenValid: false }]) {
      const card = evaluatePlaybook(input(over));
      assert.ok(g5(card), 'G5 row is missing');
      assert.equal(typeof g5(card).reason, 'string');
    }
  });
});

describe('G5 calibration — real payloads through the real gate', () => {
  const CALIBRATION = 'artifacts/keystats-calibration';

  const load = (emiten: string) => {
    const raw = readFileSync(`${CALIBRATION}/${emiten}.json`, 'utf8');
    return classifyFundamentals(parseKeyStatsSeries(JSON.parse(raw) as never, emiten));
  };

  const emitens = (): string[] => {
    try {
      return readdirSync(CALIBRATION)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace(/\.json$/, ''))
        .sort();
    } catch {
      assert.fail(`missing calibration fixtures in ${CALIBRATION}`);
    }
  };

  it('vetoes the two measured distressed names and nothing else', () => {
    const byName = new Map(emitens().map((e) => [e, load(e)] as const));
    assert.equal(byName.get('POLY')?.state, 'LANDMINE');
    assert.equal(byName.get('TBIG')?.state, 'LANDMINE');

    const vetoed = emitens().filter((e) => load(e).state === 'LANDMINE');
    assert.deepEqual([...vetoed].sort(), ['POLY', 'TBIG']);
  });

  it('never vetoes a healthy bank in the calibrated set', () => {
    for (const bank of ['BBCA', 'BBNI', 'BMRI', 'BBTN']) {
      const card = evaluatePlaybook(input({ g5Profile: 'veto', fundamental: load(bank) }));
      assert.equal(card.stance, 'ENTER', `${bank} was falsely vetoed`);
    }
  });

  it('keeps the veto rate far below the 0.60 sample-collapse floor', () => {
    const all = emitens();
    const vetoed = all.filter((e) => load(e).state === 'LANDMINE').length;
    const rate = vetoed / all.length;
    assert.ok(rate <= 0.15, `veto rate ${(rate * 100).toFixed(1)}% is too aggressive`);
  });
});
