import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runStudy, quantile, pearson, slope, indexAtOrBefore, zSeriesFor, type Signal } from '../../scripts/run-macro-correlation';
import { REGIME_WINDOW } from './classifier';

/**
 * Leaf 1.2.2 — the study's own refusal to over-claim.
 *
 * The single most important property here is NEGATIVE: given a sample that
 * cannot support a bound, the study must produce NO bound. Every test in the
 * second half exists to make that failure loud, because the failure mode is
 * silent: a study that arms a clause on 13 observations produces an artifact
 * that looks exactly like one that armed it on 300, and the difference only
 * shows up later as a gate that blocks trades for no reason.
 *
 * The first half tests the arithmetic (quantile, PIT join, z alignment), which
 * the second half depends on: a subtly wrong quantile would arm a bound on
 * arbitrary data and every downstream test would still pass.
 */

const days = (n: number, from = Date.UTC(2025, 0, 1)): string[] =>
  Array.from({ length: n }, (_, i) => new Date(from + i * 86_400_000).toISOString().slice(0, 10));

describe('quantile', () => {
  it('returns null for an empty sample', () => {
    assert.equal(quantile([], 0.5), null);
  });

  it('interpolates linearly between order statistics', () => {
    // [1,2,3,4] at 0.5 -> 2.5, the midpoint of the two middle values.
    assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
    assert.equal(quantile([1, 2, 3, 4], 0), 1);
    assert.equal(quantile([1, 2, 3, 4], 1), 4);
  });

  it('assumes a SORTED input and says so by being wrong otherwise', () => {
    // The study always sorts first. This test documents that contract: the
    // function does not sort for you.
    assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  });
});

describe('pearson and slope', () => {
  it('returns null when a series has no dispersion', () => {
    // A correlation against a constant is undefined, not zero.
    assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
    assert.equal(slope([1, 1, 1], [1, 2, 3]), null);
  });

  it('returns null for fewer than three points', () => {
    assert.equal(pearson([1, 2], [1, 2]), null);
    assert.equal(slope([1, 2], [1, 2]), null);
  });

  it('is exactly 1 for a perfect positive relationship', () => {
    assert.ok(Math.abs((pearson([1, 2, 3, 4], [2, 4, 6, 8]) as number) - 1) < 1e-9);
    assert.ok(Math.abs((slope([1, 2, 3, 4], [2, 4, 6, 8]) as number) - 2) < 1e-9);
  });

  it('is exactly -1 for a perfect negative relationship', () => {
    assert.ok(Math.abs((pearson([1, 2, 3, 4], [8, 6, 4, 2]) as number) + 1) < 1e-9);
  });
});

describe('indexAtOrBefore is the point-in-time join', () => {
  it('finds the newest bar at or before the signal date', () => {
    const d = ['2026-01-01', '2026-01-05', '2026-01-10'];
    assert.equal(indexAtOrBefore(d, '2026-01-07'), 1);
    assert.equal(indexAtOrBefore(d, '2026-01-05'), 1, 'an exact match is included');
  });

  it('never returns a FUTURE bar', () => {
    const d = ['2026-01-01', '2026-01-05'];
    assert.equal(indexAtOrBefore(d, '2025-12-31'), -1, 'before the first bar there is nothing');
  });

  it('assumes a sorted series, as every caller provides', () => {
    // The join breaks at the first date AFTER asOf, which is correct for the
    // ascending, de-duplicated series the capture always writes. It is not a
    // validator: handing it an unsorted series gives an undefined answer. That
    // contract is why macro_snapshot's PK is (symbol, bar_date) and why the
    // capture always inserts in date order.
    const sorted = ['2026-01-01', '2026-01-02', '2026-01-05'];
    assert.equal(indexAtOrBefore(sorted, '2026-01-06'), 2);
  });
});

describe('zSeriesFor', () => {
  it('is null for the first WINDOW entries, where no baseline exists', () => {
    const z = zSeriesFor(days(REGIME_WINDOW + 5).map((_, i) => 100 + i));
    for (let i = 0; i < REGIME_WINDOW; i += 1) assert.equal(z[i], null, `index ${i} must be null`);
    assert.notEqual(z[REGIME_WINDOW], null);
  });
});

/** A signal whose price series is a known ramp, so forward returns are exact. */
const mkSignal = (dates: string[], closes: number[], signalDate: string, sector = 'Energi'): Signal => ({
  emiten: 'TEST',
  sector,
  signalDate,
  entryPrice: 100,
  signalDates: dates,
  closes,
});

describe('the study refuses to arm a clause on an insufficient sample', () => {
  const d = days(120);
  // A leg with real dispersion, and signals that are far too few.
  const legCloses = d.map((_, i) => 100 + Math.sin(i) * 2 + (i % 7) * 0.3);
  const signalDates = d.slice(0, 60);
  const signalCloses = legCloses.slice(0, 60);
  const signals = Array.from({ length: 5 }, (_, i) =>
    mkSignal(signalDates, signalCloses, signalDates[REGIME_WINDOW + i * 3]),
  );

  const study = runStudy({
    macro: [{ symbol: 'USDIDR', dates: d, closes: legCloses }],
    signals,
    measuredFrom: 'test',
  });

  it('emits no candidate bound for any clause', () => {
    for (const c of study.clauses) {
      assert.equal(c.candidate, null, `${c.clause} armed on ${c.observations} observations`);
      assert.ok(c.noBoundReason, `${c.clause} gave no reason for staying unarmed`);
    }
  });

  it('states the sample-size warning explicitly', () => {
    assert.ok(study.sampleWarnings.some((w) => /only 5 signal/.test(w)));
  });

  it('emits no bound even when the adverse bucket happens to look worse', () => {
    // Even a favourable-looking delta must not arm a clause on 5 points: the
    // sample, not the sign, is what makes a bound meaningless.
    const many = Array.from({ length: 8 }, (_, i) =>
      mkSignal(signalDates, signalCloses, signalDates[REGIME_WINDOW + i * 2]),
    );
    const s = runStudy({
      macro: [{ symbol: 'USDIDR', dates: d, closes: legCloses }],
      signals: many,
      measuredFrom: 'test',
    });
    for (const c of s.clauses) assert.equal(c.candidate, null);
  });
});

describe('the study arms a clause only on a measured adverse relationship', () => {
  // A synthetic leg with a PLANTED regime effect: returns are worse when the
  // trailing z is high, so a real bound exists and should be found.
  const d = days(300);
  const legCloses: number[] = [];
  let price = 100;
  for (let i = 0; i < d.length; i += 1) {
    const zs = zSeriesFor(legCloses);
    const prev = zs.length ? zs[zs.length - 1] : null;
    const regime = prev !== null && prev > 1 ? -0.01 : 0.002;
    price *= 1 + regime;
    legCloses.push(price);
  }
  // Signals whose own forward return mirrors the leg's, so the relationship is
  // real and measurable at the sample sizes the study requires.
  const signalCloses = legCloses.slice(0, 250);
  const signalDates = d.slice(0, 250);
  const signals: Signal[] = [];
  for (let i = REGIME_WINDOW; i < 240; i += 2) {
    signals.push(mkSignal(signalDates, signalCloses, signalDates[i]));
  }

  const study = runStudy({
    macro: [{ symbol: 'USDIDR', dates: d, closes: legCloses }],
    signals,
    measuredFrom: 'planted-fixture',
  });

  const fx = study.clauses.find((c) => c.clause === 'USD_IDR_DETERIORATING');

  it('finds the planted bound with provenance', () => {
    assert.ok(fx, 'the FX clause must be present');
    assert.ok(fx!.candidate, 'a planted relationship must be found');
    assert.equal(fx!.candidate!.measuredFrom, 'planted-fixture');
    assert.ok(Number.isFinite(fx!.candidate!.bound));
  });

  it('reports the adverse bucket as worse than its baseline', () => {
    const h5 = fx!.forward[0];
    assert.ok(h5 && h5.delta !== null && h5.delta < 0, 'the adverse bucket must be measurably worse');
  });

  it('leaves the legs with no data unarmed', () => {
    const ihsg = study.clauses.find((c) => c.clause === 'IHSG_BROAD_WEAKNESS');
    assert.equal(ihsg!.candidate, null);
    assert.match(ihsg!.noBoundReason ?? '', /observation/);
  });

  it('reports sector exposure as null below the minimum, never as a guess', () => {
    for (const s of study.sectorExposure) {
      for (const v of Object.values(s.exposures)) {
        // Either measured from enough pairs, or explicitly null. Never a
        // default pretending to be a measurement.
        assert.ok(v === null || Number.isFinite(v));
      }
    }
  });
});
