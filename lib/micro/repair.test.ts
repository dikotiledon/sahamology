/**
 * D18 repair-path tests (plan acceptance criterion 5).
 *
 * The audit's finding F2 was that ONE transient vendor failure permanently
 * deleted a signal from the only population that can validate Phase 2: the
 * daily job skips any session that already has a `stock_queries` row, so a
 * degraded row written as NULL was never revisited, and D10(7)'s
 * `unscoredShare` counted exactly those rows — meaning an outage degraded the
 * gate's own coverage condition while the surviving sample silently became the
 * easy one.
 *
 * D18 is the fix. Its entire value is the promise that a repair changes the
 * MICRO data and nothing else: the row already recorded a stance, so a repair
 * that rewrote price or targets would restate history rather than complete it.
 * That promise is only worth anything if it is proven, so it is asserted
 * against the SQL the script actually executes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  REPAIR_SELECT_SQL,
  REPAIR_UPDATE_SQL,
  REPAIRABLE_COLUMNS,
  IMMUTABLE_DECISION_COLUMNS,
  repairBlocker,
} from './repair';

/** The `col = ...` assignments in the SET clause, lowercased. */
function setClauseColumns(sql: string): string[] {
  const setMatch = sql.match(/\bSET\b([\s\S]*?)\bWHERE\b/i);
  if (!setMatch) throw new Error('repair UPDATE has no SET clause');
  return [...setMatch[1].matchAll(/(\w+)\s*=/g)].map((m) => m[1].toLowerCase());
}

describe('D18 repair — only degraded rows are candidates', () => {
  it('selects capture_incomplete = TRUE and nothing else', () => {
    assert.match(REPAIR_SELECT_SQL, /capture_incomplete\s*=\s*TRUE/i);
    assert.match(REPAIR_SELECT_SQL, /status\s*=\s*'success'/i);
    // No future-dated row: a session that has not happened cannot be repaired.
    assert.match(REPAIR_SELECT_SQL, /from_date\s*<=\s*CURRENT_DATE/i);
    assert.match(REPAIR_SELECT_SQL, /LIMIT\s+\$1/i);
  });

  it('never selects a complete capture', () => {
    // A complete row must be un-repairable by construction, otherwise a fresh
    // (possibly different) vendor read would overwrite a good capture.
    assert.doesNotMatch(REPAIR_SELECT_SQL, /capture_incomplete\s*=\s*FALSE/i);
    assert.doesNotMatch(REPAIR_SELECT_SQL, /capture_incomplete\s+IS\s+NOT/i);
  });
});

describe('D18 repair — the UPDATE cannot restate a decision', () => {
  it('writes exactly the repairable micro columns', () => {
    const written = setClauseColumns(REPAIR_UPDATE_SQL);
    for (const col of REPAIRABLE_COLUMNS) {
      assert.ok(written.includes(col), `expected the repair to write ${col}`);
    }
    // `capture_incomplete = FALSE` is written as a literal, not a bind, so it
    // is not in the assignment list; every other column must be accounted for.
    const extra = written.filter((c) => !REPAIRABLE_COLUMNS.includes(c as never));
    assert.deepEqual(extra, [], `repair wrote unexpected columns: ${extra.join(', ')}`);
  });

  it('touches no decision column', () => {
    const written = setClauseColumns(REPAIR_UPDATE_SQL);
    for (const col of IMMUTABLE_DECISION_COLUMNS) {
      assert.ok(
        !written.includes(col),
        `D18 is broken: the repair would rewrite ${col}, restating a recorded decision`
      );
    }
  });

  it('is scoped to a single (emiten, from_date) row', () => {
    assert.match(REPAIR_UPDATE_SQL, /WHERE\s+emiten\s*=\s*\$1\s+AND\s+from_date\s*=\s*\$2/i);
    // No blanket statement form.
    assert.doesNotMatch(REPAIR_UPDATE_SQL, /WHERE\s+(TRUE|1\s*=\s*1)\s*;/i);
  });

  it('clears the repair marker so the row is scored again', () => {
    assert.match(REPAIR_UPDATE_SQL, /capture_incomplete\s*=\s*FALSE/i);
  });
});

describe('D18 repair — unrepairable rows are reported, never defaulted', () => {
  it('blocks a row with no recorded band and says why', () => {
    const reason = repairBlocker(null);
    assert.ok(reason, 'a null band must be reported as unrepairable');
    assert.match(reason, /no band/i);
  });

  it('blocks a whitespace-only band', () => {
    // '   ' trims to '' and must not reach the vendor as a broker code.
    assert.ok(repairBlocker('   '));
  });

  it('accepts a real band code', () => {
    assert.equal(repairBlocker('CC'), null);
    assert.equal(repairBlocker('  YP  '), null, 'a padded but real code is usable');
  });
});
