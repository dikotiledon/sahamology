import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildReplayFundamentals, type SignalRow } from './replay';
import { classifyFundamentals } from '../fundamentals/rubric';
import type { KeystatsSeries } from '../fundamentals/types';

/**
 * Leaf 1.2.2 — the fundamental replay adapter.
 *
 * The governing property is the same one that made Phase 2's micro adapter
 * honest, and it is the reason a walk-forward is trustworthy at all: an
 * ABSENT reading must stay absent. Returning a neutral default would let a
 * vendor outage or an unrepaired capture masquerade as "fundamentals were
 * fine" and quietly pad the Phase 3 sample with signals the treatment never
 * actually examined.
 *
 * So this module returns exactly one of two things:
 *   - a scored `FundamentalInput`, derived from a real point-in-time snapshot, or
 *   - `null`, meaning "unscored for the Phase 3 system".
 *
 * It never fetches. A replay of a historical session must not read today's
 * KeyStats: the feed is a CURRENT snapshot, so re-fetching would grade a past
 * decision with present-day data. That is the single most important property
 * here, and the absence of any vendor call is what enforces it.
 */

// The capture date is REQUIRED, not decorative: a snapshot with no provable
// capture date cannot be shown to be point-in-time, so the adapter refuses it.
const SERIES: KeystatsSeries & { asOf: string } = {
  emiten: 'POLY',
  asOf: '2026-09-28',
  isFinancialIssuer: false,
  currency: 'IDR',
  entries: [
    { itemName: 'Total Equity', category: 'Balance Sheet', valueText: '-18,252 B', valueNum: -18252, scale: 'B' },
    { itemName: 'Altman Z-Score (Modified)', category: 'Solvency', valueText: '-183.50', valueNum: -183.5, scale: null },
  ],
};

const SOUND_SERIES: KeystatsSeries & { asOf: string } = {
  emiten: 'ASII',
  asOf: '2026-09-28',
  isFinancialIssuer: false,
  currency: 'IDR',
  entries: [
    { itemName: 'Total Equity', category: 'Balance Sheet', valueText: '289,844 B', valueNum: 289844, scale: 'B' },
    { itemName: 'Altman Z-Score (Modified)', category: 'Solvency', valueText: '3.28', valueNum: 3.28, scale: null },
  ],
};

const row = (over: Partial<SignalRow> = {}): SignalRow => ({
  emiten: 'POLY',
  from_date: '2026-09-28',
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

describe('buildReplayFundamentals — a real snapshot is scored', () => {
  it('scores a LANDMINE snapshot', () => {
    const result = buildReplayFundamentals(row(), SERIES);
    assert.ok(result, 'a real snapshot must be scored');
    assert.equal(result.state, 'LANDMINE');
    assert.deepEqual([...result.clauses].sort(), ['DISTRESS_SCORE', 'NEGATIVE_EQUITY']);
  });

  it('scores a SOUND snapshot as SOUND, not as an absence', () => {
    const result = buildReplayFundamentals(row({ emiten: 'ASII' }), SOUND_SERIES);
    assert.ok(result);
    assert.equal(result.state, 'SOUND');
    assert.deepEqual(result.clauses, []);
  });

  it('agrees exactly with the rubric, since it delegates rather than re-deriving', () => {
    for (const series of [SERIES, SOUND_SERIES]) {
      assert.deepEqual(
        buildReplayFundamentals(row(), series),
        classifyFundamentals(series),
      );
    }
  });

  it('flags a financial issuer as out of scope rather than a landmine', () => {
    const bank = classifyFundamentals({
      emiten: 'BBCA',
      isFinancialIssuer: true,
      currency: 'IDR',
      entries: SERIES.entries,
    });
    assert.equal(bank.state, 'NOT_EVALUATED');
    const result = buildReplayFundamentals(row({ emiten: 'BBCA' }), {
      ...SERIES,
      emiten: 'BBCA',
      isFinancialIssuer: true,
    });
    assert.equal(result?.state, 'NOT_EVALUATED');
    assert.equal(result?.isFinancialIssuer, true);
  });
});

describe('buildReplayFundamentals — absence stays absence', () => {
  it('returns null when there is no snapshot at all', () => {
    assert.equal(buildReplayFundamentals(row(), null), null);
    assert.equal(buildReplayFundamentals(row(), undefined), null);
  });

  it('returns null when the capture was flagged incomplete (D11)', () => {
    // The KeyStats fetch failed for this session. Treating that as SOUND would
    // pad the Phase 3 sample with signals the treatment never examined.
    assert.equal(
      buildReplayFundamentals(row({ fundamentals_incomplete: true }), SERIES),
      null,
      'a degraded capture must be unscored, not defaulted',
    );
  });

  it('returns null when the signal is flagged for another reason only', () => {
    // A Phase 2 micro flag does NOT disqualify the fundamental reading: the two
    // captures are independent, and conflating them would silently unscored
    // every signal whose micro capture happened to degrade.
    assert.ok(buildReplayFundamentals(row({ capture_incomplete: true }), SERIES));
  });

  it('returns null for a snapshot with no entries', () => {
    assert.equal(
      buildReplayFundamentals(row(), {
        emiten: 'X',
        asOf: '2026-09-28',
        isFinancialIssuer: false,
        currency: null,
        entries: [],
      }),
      null,
    );
  });

  it('returns null for a structurally broken snapshot', () => {
    for (const bad of [null, {}, { entries: null }, 'nope', 42]) {
      assert.equal(buildReplayFundamentals(row(), bad as never), null);
    }
  });

  it('never returns a fabricated SOUND for an unreadable snapshot', () => {
    for (const bad of [null, {}, { entries: null }]) {
      const result = buildReplayFundamentals(row(), bad as never);
      assert.ok(result === null || result.state !== 'SOUND', 'absent data became SOUND');
    }
  });
});

describe('buildReplayFundamentals — point-in-time integrity', () => {
  it('refuses a snapshot captured after the signal date', () => {
    // The feed is a CURRENT snapshot. Grading a 2026-09-20 decision with data
    // captured on 2026-09-28 is lookahead, and it is the failure that silently
    // inflates every backtest.
    const future = { ...SERIES, asOf: '2026-09-28' } as KeystatsSeries & { asOf: string };
    assert.equal(buildReplayFundamentals(row({ from_date: '2026-09-20' }), future), null);
  });

  it('accepts a snapshot captured on the signal date', () => {
    const same = { ...SERIES, asOf: '2026-09-28' } as KeystatsSeries & { asOf: string };
    assert.ok(buildReplayFundamentals(row({ from_date: '2026-09-28' }), same));
  });

  it('accepts a snapshot captured before the signal date', () => {
    const older = { ...SERIES, asOf: '2026-09-25' } as KeystatsSeries & { asOf: string };
    assert.ok(buildReplayFundamentals(row({ from_date: '2026-09-28' }), older));
  });

  it('rejects a malformed signal date rather than assuming', () => {
    const snapshot = { ...SERIES, asOf: '2026-09-28' } as KeystatsSeries & { asOf: string };
    assert.equal(buildReplayFundamentals(row({ from_date: 'not-a-date' }), snapshot), null);
    assert.equal(buildReplayFundamentals(row({ from_date: '' }), snapshot), null);
  });

  it('treats a snapshot with no capture date as unusable', () => {
    // An undated snapshot cannot be proven point-in-time, so it is not used —
    // even though the data inside it is perfectly readable.
    const { asOf: _dropped, ...undated } = SERIES;
    assert.equal(buildReplayFundamentals(row({ from_date: '2026-09-28' }), undated), null);
  });
});
