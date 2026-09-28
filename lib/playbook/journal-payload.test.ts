import assert from 'node:assert/strict';
import { describe, it, test } from 'node:test';
import { buildJournalPayload } from './journal-payload';
import { evaluatePlaybook } from './evaluate';
import { defaultCostModel } from './costs';
import type { PlaybookCard } from '../playbook';

const card: PlaybookCard = {
  stance: 'ENTER',
  gates: [
    { id: 'G0', pass: true, reason: 'ok' },
    { id: 'G1', pass: true, reason: 'ok' },
    { id: 'G4', pass: true, skipped: true, reason: 'phase-0' },
  ],
  entry: 1000,
  r1: 1120,
  max: 1180,
  invalidation: 950,
  rr: 2.1,
  thesis: 'G0–G3 lolos',
  failedGates: [],
};

test('payload serializes evaluator card into journal columns', () => {
  const payload = buildJournalPayload('bbri', '2026-09-25', card);
  assert.deepEqual(payload.emiten, 'BBRI');
  assert.deepEqual(payload.as_of, '2026-09-25');
  assert.deepEqual(payload.stance, 'ENTER');
  assert.deepEqual(payload.entry, 1000);
  assert.deepEqual(payload.r1, 1120);
  assert.deepEqual(payload.max, 1180);
  assert.deepEqual(payload.invalidation, 950);
  assert.deepEqual(payload.rr, 2.1);
  assert.deepEqual(payload.failed_gates, []);
  assert.deepEqual(payload.gates, [
    { id: 'G0', pass: true, skipped: false, reason: 'ok' },
    { id: 'G1', pass: true, skipped: false, reason: 'ok' },
    { id: 'G4', pass: true, skipped: true, reason: 'phase-0' },
  ]);
});

test('failed gates serialize into text[]', () => {
  const payload = buildJournalPayload('CPRO', '2026-09-25', {
    ...card,
    stance: 'AVOID',
    failedGates: ['G0', 'G1'],
    thesis: 'G0: degenerate; G1: Retail',
  });
  assert.deepEqual(payload.stance, 'AVOID');
  assert.deepEqual(payload.failed_gates, ['G0', 'G1']);
  assert.equal((payload.thesis as string).length > 0, true);
});

test('emiten and as_of are validated', () => {
  assert.throws(() => buildJournalPayload('  ', '2026-09-25', card), /emiten/);
  assert.throws(() => buildJournalPayload('BBRI', 'not-a-date', card), /as_of/);
});

/**
 * Phase 3 (G5) — the journal is the audit record of what the system believed
 * and why, and two properties pull against each other here.
 *
 *   FIDELITY      the G5 row must record the fundamental state that produced the
 *                 stance, with MACHINE keys (LANDMINE, NEGATIVE_EQUITY), never
 *                 prose. A journal that says "the fundamentals looked bad"
 *                 cannot be re-scored or audited later.
 *
 *   COMPATIBILITY a signal with no fundamental reading must serialize BYTE for
 *                 BYTE as a pre-Phase-3 row. The key is ABSENT, not null —
 *                 the same discipline Phase 2 used for `micro`.
 */

const p3card = (over: Partial<Parameters<typeof evaluatePlaybook>[0]> = {}): PlaybookCard =>
  evaluatePlaybook({
    harga: 1000,
    ara: 1400,
    arb: 900,
    totalBid: 100,
    totalOffer: 100,
    bandar: 'BK',
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
    } as never,
    brokerType: 'Smartmoney',
    priorBandar: ['BK'],
    isIdxSession: true,
    tokenValid: true,
    tape: {
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
    } as never,
    costs: defaultCostModel(),
    ...over,
  });

const p3g5row = (payload: ReturnType<typeof buildJournalPayload>) =>
  payload.gates.find((g) => (g as { id: string }).id === 'G5') as Record<string, unknown>;

describe('buildJournalPayload — the fundamental view rides on the G5 row', () => {
  it('attaches state, clauses, reason and profile to the G5 row ONLY', () => {
    const payload = buildJournalPayload(
      'POLY',
      '2026-09-28',
      p3card({
        g5Profile: 'veto',
        fundamental: {
          state: 'LANDMINE',
          clauses: ['NEGATIVE_EQUITY', 'DISTRESS_SCORE'],
          isFinancialIssuer: false,
          reason: 'veto-clause-fired',
        },
      }),
    );

    assert.deepEqual(p3g5row(payload).fundamental, {
      state: 'LANDMINE',
      clauses: ['NEGATIVE_EQUITY', 'DISTRESS_SCORE'],
      isFinancialIssuer: false,
      reason: 'veto-clause-fired',
      g5Profile: 'veto',
    });

    for (const gate of payload.gates) {
      if ((gate as { id: string }).id !== 'G5') {
        assert.equal(
          (gate as Record<string, unknown>).fundamental,
          undefined,
          'the fundamental view leaked onto a non-G5 row',
        );
      }
    }
  });

  it('records the profile even when off, so the row says what was armed', () => {
    const payload = buildJournalPayload(
      'BBRI',
      '2026-09-28',
      p3card({
        g5Profile: 'off',
        fundamental: { state: 'SOUND', clauses: [], isFinancialIssuer: false, reason: 'no-veto-clause-fired' },
      }),
    );
    assert.equal((p3g5row(payload).fundamental as { g5Profile: string }).g5Profile, 'off');
  });

  it('serialises NOT_EVALUATED explicitly rather than omitting a failed capture', () => {
    // A measured absence under an armed profile must be distinguishable from a
    // pre-Phase-3 row, otherwise "we had no data" and "this predates G5" are
    // indistinguishable in the audit trail.
    const payload = buildJournalPayload(
      'TLKM',
      '2026-09-28',
      p3card({
        g5Profile: 'veto',
        fundamental: { state: 'NOT_EVALUATED', clauses: [], isFinancialIssuer: false, reason: 'no-keystats' },
      }),
    );
    assert.equal((p3g5row(payload).fundamental as { state: string }).state, 'NOT_EVALUATED');
  });

  it('uses machine keys, never prose', () => {
    const payload = buildJournalPayload(
      'POLY',
      '2026-09-28',
      p3card({
        g5Profile: 'veto',
        fundamental: { state: 'LANDMINE', clauses: ['NEGATIVE_EQUITY'], isFinancialIssuer: false, reason: 'veto-clause-fired' },
      }),
    );
    const view = p3g5row(payload).fundamental as Record<string, unknown>;
    assert.equal(view.state, 'LANDMINE');
    for (const [key, value] of Object.entries(view)) {
      if (typeof value !== 'string') continue;
      // The closed state and profile enums are UPPER_SNAKE by design; the
      // machine reasons and clauses are lower-kebab. What is forbidden is prose
      // — a sentence, a number, or anything with spaces.
      const machine =
        /^[A-Z][A-Z0-9_]*$/.test(value) || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
      assert.ok(machine, `non-machine value for ${key}: ${value}`);
      assert.doesNotMatch(value, /\s/, `${key} looks like prose: ${value}`);
    }
  });
});

describe('buildJournalPayload — a pre-Phase-3 card serializes identically', () => {
  it('omits the key entirely (not null) when there is no fundamental view', () => {
    const row = p3g5row(buildJournalPayload('ASII', '2026-09-28', p3card()));
    assert.equal('fundamental' in row, false, 'the key must be ABSENT, not null');
  });

  it('produces the same JSON with and without an explicit off profile', () => {
    const none = buildJournalPayload('ASII', '2026-09-28', p3card());
    const off = buildJournalPayload('ASII', '2026-09-28', p3card({ g5Profile: 'off' }));
    assert.equal(JSON.stringify(off), JSON.stringify(none));
  });

  it('leaves the Phase 2 micro key contract intact alongside the new one', () => {
    const payload = buildJournalPayload(
      'ASII',
      '2026-09-28',
      p3card({
        g1Profile: 'phase-2',
        micro: { bandCode: 'BK', tier: 'spike', accdistState: 'DIST', flowState: 'bad' },
      }),
    );
    const g1 = payload.gates.find((g) => (g as { id: string }).id === 'G1') as Record<string, unknown>;
    assert.ok(g1.micro, 'the Phase 2 micro key was lost');
    assert.equal('fundamental' in g1, false);
  });
});
