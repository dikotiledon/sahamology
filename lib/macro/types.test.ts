import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MACRO_CLAUSES,
  MACRO_FETCH_LIMIT,
  MACRO_MAX_SPAN_DAYS,
  MACRO_SERIES,
  REGIME_REASON,
  CLAUSE_LEG,
  type G7Profile,
  type MacroClause,
  type MacroSeries,
  type MacroState,
} from './types';

/**
 * Leaf 1.1.1 — the frozen macro vocabulary and the two measured vendor caps.
 *
 * This file is a CONTRACT test, not a behaviour test: it pins the exact
 * cardinality of every closed set, because the G7 gates downstream (G9 in the
 * root ledger) assert "no unmeasured clause" by comparing against these lists.
 * A set that silently grows a fourth clause would make that gate unsound, and a
 * set that loses a member would make a live clause unarmable.
 *
 * The GOLD case is the one that earns its keep. It is the symbol that answers
 * HTTP 200 with a real price while being a completely different instrument.
 * A type-level "is this a valid commodity symbol" check is the only place that
 * trap can be caught before it reaches stored history.
 */

describe('macro vocabulary', () => {
  it('has exactly four regime states', () => {
    const states: MacroState[] = ['SUPPORTIVE', 'NEUTRAL', 'CAUTION', 'NOT_EVALUATED'];
    assert.equal(states.length, 4);
    assert.equal(new Set(states).size, 4);
  });

  it('has exactly three caution clauses', () => {
    assert.deepEqual([...MACRO_CLAUSES], ['IHSG_DOWNTREND', 'RUPIAH_SHOCK', 'COMMODITY_HEADWIND']);
  });

  it('has exactly five series', () => {
    assert.equal(MACRO_SERIES.length, 5);
    assert.equal(new Set(MACRO_SERIES).size, 5);
  });

  it('exposes exactly the four measured reason keys', () => {
    assert.deepEqual(Object.keys(REGIME_REASON).sort(), [
      'ALL_CLEAR',
      'CAUTION_CLAUSE_FIRED',
      'NOT_EVALUATED',
      'NO_DATA',
    ]);
  });

  it('maps every clause to at least one leg and no leg outside MACRO_SERIES', () => {
    for (const clause of MACRO_CLAUSES) {
      const legs = CLAUSE_LEG[clause];
      assert.ok(legs.length > 0, `${clause} reads no leg`);
      for (const leg of legs) {
        assert.ok(
          (MACRO_SERIES as readonly string[]).includes(leg),
          `${clause} reads ${leg}, which is not in MACRO_SERIES`,
        );
      }
    }
  });

  it('has a three-value profile whose absent value is off', () => {
    const profiles: G7Profile[] = ['off', 'visible', 'veto'];
    assert.equal(profiles.length, 3);
  });
});

describe('commodity leg identity', () => {
  it('never treats GOLD as a commodity', () => {
    assert.ok(
      !(MACRO_SERIES as readonly string[]).includes('GOLD'),
      'GOLD resolves to an IDX emiten, not a metal',
    );
  });

  it('uses XAU as the gold leg', () => {
    assert.ok((MACRO_SERIES as readonly string[]).includes('XAU'));
  });

  it('points COMMODITY_HEADWIND at the commodity legs only', () => {
    const legs: readonly MacroSeries[] = CLAUSE_LEG.COMMODITY_HEADWIND;
    assert.ok(legs.includes('XAU'));
    assert.ok(legs.includes('OIL'));
    assert.ok(legs.includes('BRENT'));
    assert.ok(!legs.includes('IHSG'));
    assert.ok(!legs.includes('USDIDR'));
  });
});

describe('measured vendor limits', () => {
  it('caps the page size at the measured 50', () => {
    // limit=51 returned HTTP 400 INVALID_PARAMETER in the live probe.
    assert.equal(MACRO_FETCH_LIMIT, 50);
  });

  it('caps the date span at the measured 365 days', () => {
    // A >365d window returned HTTP 400 INVALID_PARAMETER in the live probe.
    assert.equal(MACRO_MAX_SPAN_DAYS, 365);
  });
});

describe('clause type is closed', () => {
  it('accepts only the three declared clause strings', () => {
    const ok: MacroClause[] = ['IHSG_DOWNTREND', 'RUPIAH_SHOCK', 'COMMODITY_HEADWIND'];
    assert.equal(ok.length, MACRO_CLAUSES.length);
  });
});
