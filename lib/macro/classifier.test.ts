import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyRegime,
  populationStdev,
  trailingZScore,
  REGIME_THRESHOLD,
  REGIME_WINDOW,
  type ClassifyInput,
  type RegimeThreshold,
} from './classifier';
import { MACRO_CLAUSES, REGIME_REASON, type MacroSeries } from './types';

/**
 * Leaf 1.2.1 — the pure classifier.
 *
 * The property under test throughout is FAIL-OPEN. A macro leg that cannot be
 * measured must produce `NOT_EVALUATED` with a reason key, never a neutral
 * pass and never a block. The reason this is worth so much test surface: G7
 * failing CLOSED on absent data would block every trade on a vendor outage,
 * and G7 failing OPEN on a genuine break would arm the gate on nothing. Both
 * are silent, and both are the kind of bug that only shows up as "the system
 * seemed fine".
 *
 * The other property is the strictly-prior baseline. `trailingZScore` is tested
 * directly against the case it exists to prevent: a single huge bar inside its
 * own window, which would shrink its own deviation to near zero.
 */

/**
 * A window with real dispersion, oldest first.
 *
 * The `(i % 5) - 2` term is what makes these usable: a constant window has zero
 * population stdev, and `trailingZScore` correctly refuses to divide by it, so
 * a "flat" fixture would silently turn every z-assertion into a null-assertion.
 */
const series = (n: number, base: number, drift = 0): number[] =>
  Array.from({ length: n }, (_, i) => base + i * drift + ((i % 5) - 2) * base * 0.01);

const bars = (symbol: MacroSeries, closes: number[]) => ({ symbol, closes });

/** A bound that is present AND carries the provenance the contract requires. */
const measured = (bound: number, direction: 1 | -1): RegimeThreshold => ({
  bound,
  measuredFrom: 'test-fixture',
  direction,
});

const input = (over: Partial<ClassifyInput> = {}): ClassifyInput => ({
  series: [bars('IHSG', series(REGIME_WINDOW + 1, 7000))],
  sector: 'Energi',
  sectorCommodityLegs: [],
  ...over,
});

describe('populationStdev', () => {
  it('is the population form, not the sample form', () => {
    // [2,4,4,4,5,5,7,9]: mean 5, population variance 4 -> sd 2.
    assert.equal(populationStdev([2, 4, 4, 4, 5, 5, 7, 9]), 2);
  });

  it('returns null for an empty sample', () => {
    assert.equal(populationStdev([]), null);
  });

  it('returns null, not Infinity, for a perfectly flat window', () => {
    // A zero stdev would make the ratio Infinity, and Infinity compares at or
    // beyond ANY bound — so a dead series would fire every clause it is in.
    assert.equal(populationStdev([5, 5, 5, 5]), null);
  });
});

describe('trailingZScore', () => {
  it('excludes the current bar from its own baseline', () => {
    // A prior window WITH dispersion around 100, then a final bar of 115.
    // The baseline must not contain the 115.
    const prior = Array.from({ length: REGIME_WINDOW }, (_, i) => 100 + (i % 5) - 2);
    const withCurrent = [...prior, 115];
    const z = trailingZScore(withCurrent, REGIME_WINDOW);
    assert.notEqual(z, null);

    // The counterfactual: the same bar INCLUDED in its own baseline. If the
    // implementation used `slice(0, -1)` correctly, the two must differ, and
    // the leak must produce the SMALLER score.
    const leakedMean = [...prior, 115].reduce((a, b) => a + b, 0) / (REGIME_WINDOW + 1);
    const priorMean = prior.reduce((a, b) => a + b, 0) / REGIME_WINDOW;
    const zLeaked = (115 - leakedMean) / (populationStdev([...prior, 115]) as number);
    const zCorrect = (115 - priorMean) / (populationStdev(prior) as number);
    assert.ok(
      zCorrect > zLeaked,
      `excluding the current bar must give the larger z (correct=${zCorrect}, leaked=${zLeaked})`,
    );
    assert.equal(z, zCorrect);
  });

  it('returns null for a flat prior window, whatever the current bar is', () => {
    // Zero dispersion means the ratio is undefined. Infinity would compare
    // "at or beyond" ANY bound, so a dead series must never fire a clause.
    const flatPrior = Array(REGIME_WINDOW).fill(100);
    assert.equal(trailingZScore([...flatPrior, 100], REGIME_WINDOW), null);
    assert.equal(trailingZScore([...flatPrior, 9999], REGIME_WINDOW), null);
  });

  it('returns null with fewer than WINDOW prior bars', () => {
    assert.equal(trailingZScore([100, 101, 102], REGIME_WINDOW), null);
  });

  it('accepts exactly WINDOW prior bars and computes a z', () => {
    // One bar short of WINDOW must be null on LENGTH; exactly WINDOW must pass
    // the length gate and reach the dispersion gate.
    const withDispersion = Array.from({ length: REGIME_WINDOW }, (_, i) => 100 + (i % 5) - 2);
    assert.equal(trailingZScore([...withDispersion.slice(1), 130], REGIME_WINDOW), null);
    assert.notEqual(trailingZScore([...withDispersion, 130], REGIME_WINDOW), null);
  });

  it('uses only the LAST WINDOW prior bars, not the whole history', () => {
    const tail = Array.from({ length: REGIME_WINDOW }, (_, i) => 100 + (i % 5) - 2);
    const wild = [1, 1, 1, ...tail, 100];
    const tight = [...tail, 100];
    // The wild history is far outside the trailing window, so the two must
    // agree — otherwise a regime reading would depend on ancient bars.
    const a = trailingZScore(wild, REGIME_WINDOW);
    const b = trailingZScore(tight, REGIME_WINDOW);
    assert.equal(a, b);
  });
});

describe('classifyRegime fail-open', () => {
  it('reports NOT_EVALUATED / NO_SNAPSHOT with no bars at all', () => {
    // Every applicable leg is ABSENT, and "the capture never ran" is the more
    // urgent fact than a sector gap — the repair pass needs to re-run the
    // capture, and the gap will still be there afterwards.
    const out = classifyRegime(input({ series: [], sectorCommodityLegs: [] }));
    assert.equal(out.state, 'NOT_EVALUATED');
    assert.equal(out.reason, REGIME_REASON.NO_SNAPSHOT);
    assert.deepEqual(out.clauses, []);
  });

  it('distinguishes an applicable leg that was never captured from one that is merely short', () => {
    // Both end NOT_EVALUATED, but they are different operational problems:
    // one means the capture never ran, the other that it ran and there was not
    // yet enough history. Collapsing them would send the repair pass to the
    // wrong scope.
    const absent = classifyRegime(input({ series: [], sectorCommodityLegs: [] }));
    assert.equal(absent.reason, REGIME_REASON.NO_SNAPSHOT);

    const short = classifyRegime(
      input({ series: [bars('IHSG', series(5, 7000))], sectorCommodityLegs: [] }),
    );
    assert.equal(short.reason, REGIME_REASON.INSUFFICIENT_HISTORY);
  });

  it('reaches every NOT_EVALUATED reason from a distinct input', () => {
    const reached = new Set<string>();
    for (const inp of [
      input({ series: [], sectorCommodityLegs: [] }),
      input({ series: [bars('IHSG', series(5, 7000))], sectorCommodityLegs: [] }),
      input({ series: [], sector: null, sectorCommodityLegs: [] }),
    ]) {
      const out = classifyRegime(inp);
      if (out.state === 'NOT_EVALUATED') reached.add(out.reason);
    }
    for (const r of [REGIME_REASON.NO_SNAPSHOT, REGIME_REASON.INSUFFICIENT_HISTORY]) {
      assert.ok(reached.has(r), `${r} is unreachable`);
    }
  });

  it('reports NOT_EVALUATED / INSUFFICIENT_HISTORY with a short window', () => {
    const out = classifyRegime(input({ series: [bars('IHSG', series(5, 7000))] }));
    assert.equal(out.state, 'NOT_EVALUATED');
    assert.equal(out.reason, REGIME_REASON.INSUFFICIENT_HISTORY);
  });

  it('records the sector gap WITHOUT discarding the legs it could measure', () => {
    // An unmapped sector is a known gap, not a reason to throw away the
    // breadth and FX readings. If it were, NO_SNAPSHOT and INSUFFICIENT_HISTORY
    // would be unreachable for every bank or consumer stock.
    const out = classifyRegime(input({ sector: null, sectorCommodityLegs: [] }));
    assert.equal(out.state, 'NEUTRAL', 'the two mapped legs were measured');
    assert.equal(out.sectorUnmapped, true, 'but the gap is still on the record');
    assert.ok(out.evaluated.includes('IHSG'));
  });

  it('never evaluates the commodity leg when the sector maps to nothing', () => {
    // A captured XAU is irrelevant when the sector is mapped to no commodity:
    // the clause does not apply, so its bars must not be read at all.
    const out = classifyRegime(
      input({ series: [bars('XAU', series(REGIME_WINDOW + 1, 4000))], sector: null, sectorCommodityLegs: [] }),
    );
    assert.equal(out.state, 'NOT_EVALUATED');
    assert.equal(out.reason, REGIME_REASON.NO_SNAPSHOT, 'no applicable leg had data');
    assert.deepEqual(out.evaluated, [], 'an inapplicable leg is not an evaluated leg');
  });

  it('never fires a clause while its bound is unmeasured', () => {
    // This is the shipped default: every bound is null until leaf 1.2.2
    // measures it. A calm-looking series must still be NEUTRAL, not CAUTION.
    for (const clause of MACRO_CLAUSES) {
      assert.equal(REGIME_THRESHOLD[clause].bound, null, `${clause} has a bound before it was measured`);
      assert.equal(REGIME_THRESHOLD[clause].measuredFrom, null);
    }
    const out = classifyRegime(input());
    assert.equal(out.state, 'NEUTRAL');
    assert.deepEqual(out.clauses, []);
  });

  it('ignores a bound with no provenance even when one is supplied', () => {
    // A bound without measuredFrom is the "looks rigorous, means nothing"
    // failure the contract exists to prevent. It must not arm the clause.
    const out = classifyRegime(
      input({
        thresholds: {
          ...REGIME_THRESHOLD,
          IHSG_BROAD_WEAKNESS: { bound: 1.0, measuredFrom: '', direction: -1 },
        },
      }),
    );
    assert.notEqual(out.state, 'CAUTION');
  });
});

describe('classifyRegime measured behaviour', () => {
  it('fires IHSG_BROAD_WEAKNESS on a measured low z', () => {
    // A long calm run then a sharp drop: the final bar is far below the
    // trailing mean, so z is strongly negative.
    const calm = series(REGIME_WINDOW, 7000);
    const closes = [...calm, 6000];
    const out = classifyRegime(
      input({
        series: [bars('IHSG', closes)],
        thresholds: {
          ...REGIME_THRESHOLD,
          IHSG_BROAD_WEAKNESS: measured(1.5, -1),
        },
      }),
    );
    assert.equal(out.state, 'CAUTION');
    assert.ok(out.clauses.includes('IHSG_BROAD_WEAKNESS'));
    assert.equal(out.reason, REGIME_REASON.THRESHOLD_FIRED);
  });

  it('fires USD_IDR_DETERIORATING on a measured high z (rupiah weakness)', () => {
    const calm = series(REGIME_WINDOW, 16000);
    const out = classifyRegime(
      input({
        series: [bars('IHSG', series(REGIME_WINDOW + 1, 7000)), bars('USDIDR', [...calm, 17500])],
        thresholds: { ...REGIME_THRESHOLD, USD_IDR_DETERIORATING: measured(1.5, 1) },
      }),
    );
    assert.equal(out.state, 'CAUTION');
    assert.ok(out.clauses.includes('USD_IDR_DETERIORATING'));
  });

  it('stays NEUTRAL when the measured z is inside the bound', () => {
    const closes = series(REGIME_WINDOW + 1, 7000, 0.5);
    const out = classifyRegime(
      input({
        series: [bars('IHSG', closes)],
        thresholds: { ...REGIME_THRESHOLD, IHSG_BROAD_WEAKNESS: measured(5, -1) },
      }),
    );
    assert.equal(out.state, 'NEUTRAL');
    assert.equal(out.reason, REGIME_REASON.NO_THRESHOLD_FIRED);
  });

  it('never produces SUPPORTIVE, which the data does not support', () => {
    const out = classifyRegime(input());
    assert.notEqual(out.state, 'SUPPORTIVE');
  });

  it('records which legs were actually evaluated', () => {
    const out = classifyRegime(
      input({
        series: [bars('IHSG', series(REGIME_WINDOW + 1, 7000)), bars('USDIDR', series(REGIME_WINDOW + 1, 16000))],
        thresholds: { ...REGIME_THRESHOLD, IHSG_BROAD_WEAKNESS: measured(5, -1) },
      }),
    );
    assert.ok(out.evaluated.includes('IHSG'));
    assert.ok(out.evaluated.includes('USDIDR'));
  });
});

describe('the sector commodity leg', () => {
  it('fires SECTOR_COMMODITY_ADVERSE when a mapped leg is adverse', () => {
    const calm = series(REGIME_WINDOW, 4000);
    const out = classifyRegime(
      input({
        series: [
          bars('IHSG', series(REGIME_WINDOW + 1, 7000)),
          bars('XAU', [...calm, 4600]),
        ],
        sectorCommodityLegs: ['XAU'],
        thresholds: { ...REGIME_THRESHOLD, SECTOR_COMMODITY_ADVERSE: measured(1.5, 1) },
      }),
    );
    assert.equal(out.state, 'CAUTION');
    assert.ok(out.clauses.includes('SECTOR_COMMODITY_ADVERSE'));
    assert.equal(out.sectorUnmapped, false);
  });

  it('does not fire when the mapped commodity leg is calm', () => {
    const out = classifyRegime(
      input({
        series: [
          bars('IHSG', series(REGIME_WINDOW + 1, 7000)),
          bars('XAU', series(REGIME_WINDOW + 1, 4000)),
        ],
        sectorCommodityLegs: ['XAU'],
        thresholds: { ...REGIME_THRESHOLD, SECTOR_COMMODITY_ADVERSE: measured(5, 1) },
      }),
    );
    assert.equal(out.state, 'NEUTRAL');
  });

  it('is a recorded gap, not a data loss, when unmapped', () => {
    const out = classifyRegime(input({ sectorCommodityLegs: [] }));
    assert.equal(out.sectorUnmapped, true);
    assert.ok(!out.clauses.includes('SECTOR_COMMODITY_ADVERSE'));
  });

  it('still measures breadth when the commodity leg is unmapped', () => {
    const calm = series(REGIME_WINDOW, 7000);
    const out = classifyRegime(
      input({
        series: [bars('IHSG', [...calm, 6000])],
        sectorCommodityLegs: [],
        thresholds: { ...REGIME_THRESHOLD, IHSG_BROAD_WEAKNESS: measured(1.5, -1) },
      }),
    );
    assert.equal(out.state, 'CAUTION');
    assert.ok(out.clauses.includes('IHSG_BROAD_WEAKNESS'));
    assert.equal(out.sectorUnmapped, true);
  });
});

describe('the clause set is closed', () => {
  it('emits only declared clause names', () => {
    const out = classifyRegime(
      input({
        series: [bars('IHSG', [...series(REGIME_WINDOW, 7000), 6000]), bars('USDIDR', [...series(REGIME_WINDOW, 16000), 18000])],
        thresholds: {
          ...REGIME_THRESHOLD,
          IHSG_BROAD_WEAKNESS: measured(1, -1),
          USD_IDR_DETERIORATING: measured(1, 1),
        },
      }),
    );
    for (const c of out.clauses) {
      assert.ok((MACRO_CLAUSES as readonly string[]).includes(c), `undeclared clause ${c}`);
    }
  });
});
