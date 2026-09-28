import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { parseKeyStatsSeries } from './keystats-series';
import { classifyFundamentals } from './rubric';
import { FUNDAMENTAL_REASON, VETO_CLAUSES, type KeystatsSeries } from './types';

/**
 * Leaf 1.1.2 — the frozen rubric, calibrated against REAL payloads.
 *
 * Every assertion in the calibration block below is derived from live data
 * captured 2026-09-28 (26 emitens under artifacts/keystats-calibration/), not
 * from a synthetic guess. The three facts that shaped the thresholds:
 *
 *   1. 5 of the 10 live watchlist names are commercial banks. A naive
 *      "liabilities/equity > 5" clause vetoes BBCA 5.14, BBNI 7.89, BMRI 7.85
 *      and BBTN 13.52 — a 50% sample collapse that makes the ship gate
 *      unreachable by construction. Bank exclusion is load-bearing, not a nicety.
 *   2. Every healthy non-bank sits far below any sane leverage ceiling
 *      (TL/E 0.08–1.85), so the threshold has real headroom.
 *   3. Genuinely distressed names DO surface: POLY shows Total Equity
 *      -18,252 B and Altman -183.50; TBIG shows Altman -1.14. Those are the
 *      positive controls — without them the rubric would be unfalsifiable.
 *
 * The rubric is pure: no I/O, no clock, no environment, no vendor call.
 */

/**
 * Build a snapshot from raw value STRINGS, running them through the real
 * parser. Hand-writing `valueNum` here would let the fixture and the parser
 * disagree — which is exactly the bug this helper originally had.
 */
const series = (entries: Array<[string, string | null]>, isFinancialIssuer = false): KeystatsSeries => {
  const categories = entries.map(([itemName, valueText], i) => ({
    keystats_name: `cat-${i}`,
    fin_name_results: [
      {
        fitem: { id: String(i), name: itemName, value: valueText ?? '-' },
        hidden_graph_ico: false,
        is_new_update: false,
      },
    ],
  }));
  const parsed = parseKeyStatsSeries({ data: { closure_fin_items_results: categories } } as never, 'TEST');
  return { ...parsed, isFinancialIssuer };
};

const CALIBRATION = 'artifacts/keystats-calibration';

const loadCalibration = (emiten: string): KeystatsSeries => {
  const raw = readFileSync(`${CALIBRATION}/${emiten}.json`, 'utf8');
  return parseKeyStatsSeries(JSON.parse(raw) as never, emiten);
};

const calibrationEmitens = (): string[] => {
  try {
    return readdirSync(CALIBRATION)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
  } catch {
    assert.fail(`missing calibration fixtures in ${CALIBRATION}`);
  }
};

describe('classifyFundamentals — closed states and fail-open behaviour', () => {
  it('returns NOT_EVALUATED when there is no KeyStats data at all', () => {
    const result = classifyFundamentals(null);
    assert.equal(result.state, 'NOT_EVALUATED');
    assert.equal(result.reason, FUNDAMENTAL_REASON.NO_KEYSTATS);
    assert.deepEqual(result.clauses, []);
  });

  it('returns NOT_EVALUATED for an empty snapshot (D9 fail-open)', () => {
    const result = classifyFundamentals({ emiten: 'X', entries: [], isFinancialIssuer: false, currency: null });
    assert.equal(result.state, 'NOT_EVALUATED');
  });

  it('never returns WEAK: the feed has no multi-year trend to measure', () => {
    for (const emiten of calibrationEmitens()) {
      const result = classifyFundamentals(loadCalibration(emiten));
      assert.notEqual(result.state, 'WEAK', `${emiten} produced the unmeasurable WEAK state`);
    }
  });

  it('degrades an empty snapshot to NOT_EVALUATED rather than LANDMINE', () => {
    // The critical direction: missing data must never manufacture a veto.
    for (const entries of [
      series([]),
      series([['Total Equity', '-']]),
      series([['Total Equity', '-'], ['Total Liabilities/Equity (Quarter)', '-']]),
    ]) {
      assert.equal(classifyFundamentals(entries).state, 'NOT_EVALUATED');
    }
  });
});

describe('classifyFundamentals — NEGATIVE_EQUITY', () => {
  it('fires when total equity is negative', () => {
    const result = classifyFundamentals(series([['Total Equity', '(18,252 B)']]));
    assert.equal(result.state, 'LANDMINE');
    assert.ok(result.clauses.includes('NEGATIVE_EQUITY'));
    assert.equal(result.reason, FUNDAMENTAL_REASON.VETO_CLAUSE_FIRED);
  });

  it('does not fire on positive equity', () => {
    const result = classifyFundamentals(series([['Total Equity', '328,675 B']]));
    assert.equal(result.state, 'SOUND');
    assert.deepEqual(result.clauses, []);
  });

  it('does not fire on a missing equity reading', () => {
    assert.equal(classifyFundamentals(series([['Total Equity', '-']])).state, 'NOT_EVALUATED');
  });
});

describe('classifyFundamentals — EXTREME_LEVERAGE', () => {
  it('fires on liabilities/equity above the ceiling for a non-bank', () => {
    const result = classifyFundamentals(series([['Total Liabilities/Equity (Quarter)', '6.50']]));
    assert.equal(result.state, 'LANDMINE');
    assert.ok(result.clauses.includes('EXTREME_LEVERAGE'));
  });

  it('does not fire below the ceiling', () => {
    assert.equal(
      classifyFundamentals(series([['Total Liabilities/Equity (Quarter)', '1.85']])).state,
      'SOUND',
    );
  });

  it('is bypassed entirely for a financial issuer (D5)', () => {
    // BBTN measures 13.52 — comfortably above the ceiling. Without the bank
    // exclusion this is a false veto on a large, profitable bank.
    const result = classifyFundamentals(
      series([['Total Liabilities/Equity (Quarter)', '13.52']], true),
    );
    assert.equal(result.state, 'NOT_EVALUATED');
    assert.equal(result.reason, FUNDAMENTAL_REASON.FINANCIAL_ISSUER);
    assert.deepEqual(result.clauses, []);
  });

  it('also honours the Debt to Equity variant', () => {
    assert.equal(
      classifyFundamentals(series([['Debt to Equity Ratio (Quarter)', '6.00']])).state,
      'LANDMINE',
    );
  });
});

describe('classifyFundamentals — DISTRESS_SCORE', () => {
  it('fires on a negative Altman Z-Score', () => {
    const result = classifyFundamentals(series([['Altman Z-Score (Modified)', '-1.14']]));
    assert.equal(result.state, 'LANDMINE');
    assert.ok(result.clauses.includes('DISTRESS_SCORE'));
  });

  it('does not fire on a positive Altman Z-Score', () => {
    assert.equal(
      classifyFundamentals(series([['Altman Z-Score (Modified)', '0.70']])).state,
      'SOUND',
    );
  });
});

describe('classifyFundamentals — clause hygiene', () => {
  it('only ever reports clauses from the frozen set', () => {
    for (const emiten of calibrationEmitens()) {
      const result = classifyFundamentals(loadCalibration(emiten));
      for (const clause of result.clauses) {
        assert.ok(
          (VETO_CLAUSES as readonly string[]).includes(clause),
          `${emiten} reported the undeclared clause ${clause}`,
        );
      }
    }
  });

  it('reports every fired clause, not just the first', () => {
    // POLY is negative on both equity and Altman.
    const result = classifyFundamentals(
      series([['Total Equity', '-18,252'], ['Altman Z-Score (Modified)', '-183.50']]),
    );
    assert.equal(result.state, 'LANDMINE');
    assert.deepEqual([...result.clauses].sort(), ['DISTRESS_SCORE', 'NEGATIVE_EQUITY']);
  });

  it('carries the financial-issuer flag through to the caller', () => {
    assert.equal(classifyFundamentals(series([], true)).isFinancialIssuer, true);
    assert.equal(classifyFundamentals(series([])).isFinancialIssuer, false);
  });

  it('does not throw on a malformed snapshot', () => {
    for (const bad of [null, undefined, {}, { entries: null }, { entries: [{ valueNum: 'x' }] }]) {
      assert.doesNotThrow(() => classifyFundamentals(bad as never));
    }
  });
});

describe('classifyFundamentals — calibration against live payloads', () => {
  it('vetoes exactly the measured distressed names and no healthy bank', () => {
    const emitens = calibrationEmitens();
    const byName = new Map(
      emitens.map((e) => [e, classifyFundamentals(loadCalibration(e))] as const),
    );

    // Positive controls: these two are genuinely distressed per the live data.
    assert.equal(byName.get('POLY')?.state, 'LANDMINE', 'POLY is negative equity');
    assert.equal(byName.get('TBIG')?.state, 'LANDMINE', 'TBIG has a negative Altman Z');

    // The false-veto guard: no bank may be vetoed on non-bank leverage.
    for (const bank of ['BBCA', 'BBNI', 'BMRI', 'BBTN']) {
      assert.notEqual(
        byName.get(bank)?.state,
        'LANDMINE',
        `${bank} was falsely vetoed on a non-bank clause`,
      );
    }

    // The healthy large caps must survive — a veto that eats the sample is
    // as wrong as one that misses a landmine.
    for (const healthy of ['ASII', 'TLKM', 'INDF', 'CPRO', 'ADRO', 'ITMG']) {
      assert.equal(byName.get(healthy)?.state, 'SOUND', `${healthy} should pass G5`);
    }
  });

  it('keeps the veto rate low enough to preserve the signal sample', () => {
    const emitens = calibrationEmitens();
    const vetoed = emitens.filter((e) => classifyFundamentals(loadCalibration(e)).state === 'LANDMINE');
    const rate = vetoed.length / emitens.length;
    // 2 of 26 measured. The ship gate's collapse condition is 0.60, so a
    // rubric that vetoed more than a small tail would be unusable by design.
    assert.ok(rate <= 0.15, `veto rate ${(rate * 100).toFixed(1)}% is too aggressive`);
  });

  it('never vetoes a financial issuer under the calibrated fixtures', () => {
    for (const emiten of calibrationEmitens()) {
      const snapshot = loadCalibration(emiten);
      if (snapshot.isFinancialIssuer) {
        const result = classifyFundamentals(snapshot);
        assert.notEqual(result.state, 'LANDMINE', `${emiten} is a bank and must not be vetoed`);
      }
    }
  });
});
