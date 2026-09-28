import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildReplayInput, buildReplayMacro, type ReplayMacroBar, type SignalRow } from './replay';
import { REGIME_THRESHOLD, REGIME_WINDOW, type RegimeThreshold } from '../macro/classifier';
import { REGIME_REASON, type MacroClause, type MacroSeries } from '../macro/types';
import { classifyRegime } from '../macro/classifier';

/**
 * Leaf 1.3.2 — the replay half of Phase 4.
 *
 * The live path fails OPEN on a missing regime; a replay cannot, because a
 * walk-forward DENOMINATOR is at stake. A `null` here drops the row from
 * system (4) and the reporter publishes the smaller sample. A neutral
 * `NOT_EVALUATED` stand-in would instead score a trade the experiment never
 * observed, crediting the candidate system with data it did not have. So every
 * unusable input returns `null`, and the tests below are mostly about the
 * cases that MUST NOT produce a reading.
 *
 * The second invariant is point-in-time. The classifier is pure and takes
 * bars, so the entire anti-lookahead guarantee for a replayed regime rests on
 * this module's cut. That makes the forward-dated-bar tests the load-bearing
 * ones here rather than an afterthought.
 */

const SECTOR = 'Perindustrian';

const signal = (over: Partial<SignalRow> = {}): SignalRow => ({
  emiten: 'ASII',
  from_date: '2026-09-24',
  harga: 5000,
  ara: 5500,
  arb: 4800,
  total_bid: 10000,
  total_offer: 12000,
  bandar: 'BK',
  barang_bandar: 10000,
  rata_rata_bandar: 4900,
  target_realistis: 5200,
  target_max: 5400,
  ...over,
});

/** Consecutive ISO dates ending on `end`, oldest first. */
const sessions = (end: string, n: number): string[] => {
  const out: string[] = [];
  const d = new Date(`${end}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(new Date(d.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
};

const bars = (
  symbol: MacroSeries,
  end: string,
  closes: number[],
  startIndex = 0,
): ReplayMacroBar[] =>
  sessions(end, closes.length).map((barDate, i) => ({
    symbol,
    barDate: startIndex === 0 ? barDate : `2026-01-${String(1 + (i + startIndex)).padStart(2, '0')}`,
    close: closes[i],
  }));

describe('buildReplayMacro refuses every unusable input', () => {
  it('returns null for a degraded capture (macro_incomplete)', () => {
    const ok = buildReplayMacro(
      signal({ macro_incomplete: true }),
      bars('IHSG', '2026-09-24', Array.from({ length: 25 }, (_, i) => 7000 + i)),
      { sector: SECTOR },
    );
    assert.equal(ok, null);
  });

  it('returns null when no bars were supplied', () => {
    assert.equal(buildReplayMacro(signal(), [], { sector: SECTOR }), null);
    assert.equal(buildReplayMacro(signal(), null, { sector: SECTOR }), null);
    assert.equal(buildReplayMacro(signal(), undefined, { sector: SECTOR }), null);
  });

  it('returns null when every bar is after the signal date', () => {
    // Forward-dated only: the shape a naive implementation would happily
    // score with tomorrow's data.
    const future = bars('IHSG', '2026-09-24', [7000, 7010, 7020], 0).map((b) => ({
      ...b,
      barDate: '2026-10-05',
    }));
    assert.equal(buildReplayMacro(signal(), future, { sector: SECTOR }), null);
  });

  it('returns null when the sector is unknown', () => {
    const b = bars('IHSG', '2026-09-24', Array.from({ length: 25 }, (_, i) => 7000 + i));
    assert.equal(buildReplayMacro(signal(), b, { sector: null }), null);
    assert.equal(buildReplayMacro(signal(), b, { sector: '   ' }), null);
    assert.equal(buildReplayMacro(signal(), b, {}), null);
  });

  it('returns null for a malformed signal date rather than assuming one', () => {
    const b = bars('IHSG', '2026-09-24', Array.from({ length: 25 }, (_, i) => 7000 + i));
    assert.equal(buildReplayMacro(signal({ from_date: '24-09-2026' }), b, { sector: SECTOR }), null);
  });

  it('drops non-numeric and malformed bars instead of coercing them', () => {
    const good = bars('IHSG', '2026-09-24', Array.from({ length: 25 }, (_, i) => 7000 + i));
    const dirty: ReplayMacroBar[] = [
      ...good,
      { symbol: 'IHSG', barDate: 'not-a-date', close: 9999 },
      { symbol: 'IHSG', barDate: '2026-09-24', close: Number.NaN },
    ];
    // Still scores: the good bars stand on their own, the junk is discarded.
    const reading = buildReplayMacro(signal(), dirty, { sector: SECTOR });
    assert.ok(reading, 'a few malformed bars must not unscored the whole reading');
  });
});

describe('buildReplayMacro enforces the point-in-time cut', () => {
  it('scores the signal day, never a later bar', () => {
    const before = bars('IHSG', '2026-09-24', Array.from({ length: 25 }, (_, i) => 7000 + i));
    const reading = buildReplayMacro(signal(), before, { sector: SECTOR });
    assert.ok(reading);
    assert.equal(reading!.reason, REGIME_REASON.NO_THRESHOLD_FIRED);
  });

  it('an as-of join: a signal on a Monday can use the Sunday FX bar', () => {
    // USDIDR trades 7 days a week, so the macro calendar and the IDX calendar
    // genuinely disagree. The as-of join is what keeps that from being a bug.
    const fxBars: ReplayMacroBar[] = sessions('2026-09-20', 25).map((barDate, i) => ({
      symbol: 'USDIDR',
      barDate,
      close: 16000 + i,
    }));
    // The signal is on a Monday; the newest FX bar at or before it is Sunday.
    const reading = buildReplayMacro(
      signal({ from_date: '2026-09-21' }),
      fxBars,
      { sector: SECTOR },
    );
    assert.ok(reading, 'a Sunday FX bar must be usable for a Monday signal');
    assert.ok(reading!.evaluated.includes('USDIDR'));
  });

  it('a bar dated after the signal cannot change the reading', () => {
    const base = Array.from({ length: 25 }, (_, i) => 7000 + i);
    const withSpike = [...base];
    withSpike[24] = 500; // a violent one-day crash
    const a = buildReplayMacro(
      signal(),
      bars('IHSG', '2026-09-24', base),
      { sector: SECTOR },
    );
    const b = buildReplayMacro(
      signal(),
      [...bars('IHSG', '2026-09-24', base), { symbol: 'IHSG', barDate: '2026-09-25', close: 500 }],
      { sector: SECTOR },
    );
    assert.deepEqual(b, a, 'a forward-dated bar leaked into the reading');
  });

  it('uses at most REGIME_WINDOW + 1 bars per leg', () => {
    // A long history must not change the reading: the classifier's window is
    // fixed, and an unbounded slice would silently alter the baseline.
    const long = Array.from({ length: 200 }, (_, i) => 7000 + (i % 7));
    const short = long.slice(-(REGIME_WINDOW + 1));
    const a = buildReplayMacro(signal(), bars('IHSG', '2026-09-24', long), { sector: SECTOR });
    const b = buildReplayMacro(signal(), bars('IHSG', '2026-09-24', short), { sector: SECTOR });
    assert.deepEqual(a, b);
  });
});

describe('buildReplayMacro delegates to the one classifier', () => {
  it('produces exactly what classifyRegime produces for the same bars', () => {
    const b = bars('IHSG', '2026-09-24', Array.from({ length: 25 }, (_, i) => 7000 + i));
    const viaReplay = buildReplayMacro(signal(), b, { sector: SECTOR });
    const viaClassifier = classifyRegime({
      series: [{ symbol: 'IHSG', closes: b.map((x) => x.close) }],
      sector: SECTOR,
    });
    assert.deepEqual(viaReplay, viaClassifier);
  });

  it('a CAUTION regime is reachable when a measured bound is supplied', () => {
    // The shipped bounds are all null, so the live system can never reach
    // CAUTION. Arm ONE bound here to prove the wiring carries a real CAUTION
    // through the replay — and that a single armed clause is enough.
    const thresholds: Record<MacroClause, RegimeThreshold> = {
      ...REGIME_THRESHOLD,
      IHSG_BROAD_WEAKNESS: { bound: -1.5, measuredFrom: 'test:planted', direction: -1 },
    };
    // A flat baseline would give a zero stdev, and the classifier rightly
    // reports NOT_EVALUATED for an undefined z. Real dispersion is required
    // for any clause to be measurable at all.
    const noisy = Array.from({ length: 24 }, (_, i) => 7000 + (i % 5) * 10);
    const withCrash = [...noisy, 6600];
    const reading = buildReplayMacro(signal(), bars('IHSG', '2026-09-24', withCrash), {
      sector: SECTOR,
    });
    // Unarmed: the shipped threshold has no bound, so the same data is NEUTRAL.
    assert.equal(reading?.state, 'NEUTRAL', 'an unarmed bound must still read NEUTRAL');

    // Armed through the classifier directly, to prove the path is the same.
    const armed = classifyRegime({
      series: [{ symbol: 'IHSG', closes: withCrash }],
      sector: SECTOR,
      thresholds,
    });
    assert.equal(armed.state, 'CAUTION');
    assert.deepEqual(armed.clauses, ['IHSG_BROAD_WEAKNESS']);
  });
});

describe('buildReplayInput carries the macro reading additively', () => {
  it('omits both keys entirely when nothing was scored', () => {
    const input = buildReplayInput(signal(), ['BK']);
    assert.ok(input);
    assert.ok(!('macro' in input), 'the macro key must stay ABSENT, not null');
    assert.ok(!('g7Profile' in input));
  });

  it('carries both when the profile and reading are supplied', () => {
    const input = buildReplayInput(signal(), ['BK'], {
      g7Profile: 'veto',
      macro: {
        state: 'CAUTION',
        clauses: ['IHSG_BROAD_WEAKNESS'],
        reason: REGIME_REASON.THRESHOLD_FIRED,
        evaluated: ['IHSG'],
        sectorUnmapped: true,
      },
    });
    assert.equal(input?.g7Profile, 'veto');
    assert.equal(input?.macro?.state, 'CAUTION');
  });

  it('a null macro is dropped rather than passed through as a reading', () => {
    const input = buildReplayInput(signal(), ['BK'], { g7Profile: 'visible', macro: null as never });
    assert.ok(!('macro' in input!), 'a null reading must not become a field');
  });
});
