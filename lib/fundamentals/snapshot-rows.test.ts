/**
 * The read path must reproduce the capture path exactly.
 *
 * A snapshot is written by one function and read back by another. If the reader
 * cannot reproduce what the writer produced, then the card a human sees today
 * and the card a replay scores next month are computed from different data —
 * and the comparison the whole Phase 3 ship gate rests on is meaningless.
 *
 * The dangerous drift is not a wrong number, it is a MISCLASSIFIED ISSUER. The
 * financial-issuer flag is derived from entry names, so a reader that dropped,
 * renamed or empty-filed an item could take a healthy bank and put it back
 * through a non-bank leverage veto. These tests therefore assert issuer
 * agreement explicitly, on real captured payloads, not on hand-written mocks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { parseKeyStatsSeries, isFinancialIssuerEntries } from './keystats-series';
import { classifyFundamentals } from './rubric';
import {
  rowToKeystatsEntry,
  rowsToKeystatsSeries,
  toNumericOrNull,
  type KeystatsSnapshotRow,
} from './snapshot-rows';
import type { ReplayKeystatsSeries } from '../playbook/replay';

/**
 * Simulate the persistence hop: an entry in, a `NUMERIC`-as-string row out.
 * This is deliberately lossy in exactly the way Postgres is — `pg` hands NUMERIC
 * back as a string, and a SQL NULL comes back as JS null for every column.
 */
function entryToRow(itemName: string, entry: ReplayKeystatsSeries['entries'][number]): KeystatsSnapshotRow {
  return {
    item_name: itemName,
    category: entry.category,
    // value_text is nullable in the schema; the writer stores the raw text.
    value_text: entry.valueText === '' ? null : entry.valueText,
    value_num: entry.valueNum === null ? null : String(entry.valueNum),
    scale: entry.scale,
  };
}

const CALIBRATION_DIR = join(process.cwd(), 'artifacts', 'keystats-calibration');

function calibrationFiles(): string[] {
  try {
    return readdirSync(CALIBRATION_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
}

test('toNumericOrNull: a number that cannot be read is null, never zero', () => {
  // The specific failure this guards: an unreadable NUMERIC silently becoming
  // 0 would invent a measured "zero equity" or "zero leverage" reading.
  assert.equal(toNumericOrNull(null), null);
  assert.equal(toNumericOrNull(undefined), null);
  assert.equal(toNumericOrNull(''), null);
  assert.equal(toNumericOrNull('   '), null);
  assert.equal(toNumericOrNull('not-a-number'), null);
  assert.equal(toNumericOrNull(NaN), null);
  assert.equal(toNumericOrNull(Infinity), null);
  assert.equal(toNumericOrNull({}), null);
  assert.equal(toNumericOrNull([]), null);
  assert.equal(toNumericOrNull(true), null);
});

test('toNumericOrNull: a measured zero stays zero, and strings parse', () => {
  // The mirror image of the test above: a REAL zero must survive, or a company
  // with genuinely zero equity would read as "no data" and escape the veto.
  assert.equal(toNumericOrNull(0), 0);
  assert.equal(toNumericOrNull('0'), 0);
  assert.equal(toNumericOrNull('-18252'), -18252);
  assert.equal(toNumericOrNull('213308000000'), 213308000000);
  assert.equal(toNumericOrNull('-1.42'), -1.42);
  assert.equal(toNumericOrNull(12.5), 12.5);
});

test('rowToKeystatsEntry: nulls normalise to placeholders but valueNum stays null', () => {
  const entry = rowToKeystatsEntry({
    item_name: 'Total Equity',
    category: null,
    value_text: null,
    value_num: null,
    scale: null,
  });
  assert.equal(entry.itemName, 'Total Equity');
  assert.equal(entry.category, 'unknown');
  assert.equal(entry.valueText, '');
  // The critical one: absent, not zero.
  assert.equal(entry.valueNum, null);
  assert.equal(entry.scale, null);
});

test('rowToKeystatsEntry: an empty category string is not a category', () => {
  const entry = rowToKeystatsEntry({ item_name: 'X', category: '', value_text: '' });
  assert.equal(entry.category, 'unknown');
});

test('rowsToKeystatsSeries: order does not depend on the driver', () => {
  const a = rowsToKeystatsSeries({
    emiten: 'BBRI',
    asOf: '2026-09-28',
    rows: [
      { item_name: 'Total Equity', value_num: '1' },
      { item_name: 'Altman Z-Score (Modified)', value_num: '2' },
    ],
  });
  const b = rowsToKeystatsSeries({
    emiten: 'BBRI',
    asOf: '2026-09-28',
    rows: [
      { item_name: 'Altman Z-Score (Modified)', value_num: '2' },
      { item_name: 'Total Equity', value_num: '1' },
    ],
  });
  assert.deepEqual(a.entries, b.entries);
  assert.deepEqual(
    a.entries.map((e) => e.itemName),
    ['Altman Z-Score (Modified)', 'Total Equity'],
  );
});

test('rowsToKeystatsSeries: an empty row set is an empty series, not a throw', () => {
  const series = rowsToKeystatsSeries({ emiten: 'XXXX', asOf: '2026-09-28', rows: [] });
  assert.deepEqual(series.entries, []);
  assert.equal(series.emiten, 'XXXX');
  assert.equal(series.asOf, '2026-09-28');
});

/**
 * Nothing may be lost, renamed or altered in the hop.
 *
 * The verdict-equality tests below are not sufficient on their own: a reader
 * that drops a single bank-exclusive metric still reaches the right verdict
 * because three other metrics remain, and a reader that pads a category
 * corrupts stored data without moving a single number. Both survived mutation
 * testing until this test was written. Fidelity is asserted here separately
 * from the verdict, because "the answer was right" and "we kept the data" are
 * different promises.
 */
test('the round trip loses no item, renames none, and alters no reading', () => {
  const files = calibrationFiles();
  if (files.length === 0) assert.fail('no calibration payloads found — this test would be vacuous');

  for (const file of files) {
    const emiten = file.replace(/\.json$/, '');
    const payload: unknown = JSON.parse(readFileSync(join(CALIBRATION_DIR, file), 'utf8'));
    const direct: ReplayKeystatsSeries = parseKeyStatsSeries(payload as never, emiten);

    const readBack = rowsToKeystatsSeries({
      emiten,
      asOf: '2026-09-28',
      rows: direct.entries.map((entry) => entryToRow(entry.itemName, entry)),
    });

    const before = new Map(direct.entries.map((e) => [e.itemName, e]));
    const after = new Map(readBack.entries.map((e) => [e.itemName, e]));

    assert.equal(
      after.size,
      before.size,
      `${emiten}: item count changed across the round trip (${before.size} -> ${after.size})`,
    );

    for (const [name, source] of before) {
      const target = after.get(name);
      assert.ok(target, `${emiten}: item "${name}" was lost or renamed across the round trip`);
      assert.equal(
        target.valueNum,
        source.valueNum,
        `${emiten}: value for "${name}" changed across the round trip`,
      );
      assert.equal(
        target.category,
        source.category === '' ? 'unknown' : source.category,
        `${emiten}: category for "${name}" was altered across the round trip`,
      );
      assert.equal(
        target.scale,
        source.scale,
        `${emiten}: scale for "${name}" was altered across the round trip`,
      );
    }
  }
});

/**
 * The load-bearing test: for every real captured payload, the verdict computed
 * from a WRITTEN snapshot must equal the verdict computed from the ORIGINAL.
 */
test('a verdict survives the persistence round trip, for every captured payload', () => {
  const files = calibrationFiles();
  if (files.length === 0) {
    // Never silently pass: an absent artifact directory would turn this into a
    // vacuous green that hides exactly the drift it exists to catch.
    assert.fail('no calibration payloads found — this test would be vacuous');
  }

  for (const file of files) {
    const emiten = file.replace(/\.json$/, '');
    const payload: unknown = JSON.parse(readFileSync(join(CALIBRATION_DIR, file), 'utf8'));

    const direct: ReplayKeystatsSeries = parseKeyStatsSeries(payload as never, emiten);

    // Write, then read back.
    const written = direct.entries.map((entry) => entryToRow(entry.itemName, entry));
    const readBack = rowsToKeystatsSeries({ emiten, asOf: '2026-09-28', rows: written });

    // The financial-issuer classification must be IDENTICAL on both sides.
    assert.equal(
      isFinancialIssuerEntries(readBack.entries),
      direct.isFinancialIssuer,
      `${emiten}: issuer classification changed across the round trip`,
    );

    const before = classifyFundamentals(direct);
    // Scored purely from what came BACK, with the reader's own derived flag.
    // If the reader can classify an issuer, it can score it.
    const after = classifyFundamentals(readBack);

    assert.equal(after.state, before.state, `${emiten}: state changed across the round trip`);
    assert.deepEqual(after.clauses, before.clauses, `${emiten}: clauses changed across the round trip`);
  }
});

test('every real financial issuer stays excluded after the round trip', () => {
  // The measured failure this whole design exists to prevent: 5 of 10 watchlist
  // emitens are banks whose liabilities/equity is 5.14 to 13.52, all healthy.
  // A single lost bank-exclusive metric name would push them through the
  // non-bank leverage veto and collapse the sample by 50%.
  const banks = ['BBRI', 'BBCA', 'BBNI', 'BMRI', 'BBTN'];
  const available = calibrationFiles().map((f) => f.replace(/\.json$/, ''));
  const present = banks.filter((b) => available.includes(b));

  assert.ok(present.length > 0, 'no bank payloads available — test would be vacuous');

  for (const bank of present) {
    const payload: unknown = JSON.parse(
      readFileSync(join(CALIBRATION_DIR, `${bank}.json`), 'utf8'),
    );
    const series: ReplayKeystatsSeries = parseKeyStatsSeries(payload as never, bank);
    assert.equal(series.isFinancialIssuer, true, `${bank} should be detected as a financial issuer`);

    const readBack = rowsToKeystatsSeries({
      emiten: bank,
      asOf: '2026-09-28',
      rows: series.entries.map((entry) => entryToRow(entry.itemName, entry)),
    });
    assert.equal(
      isFinancialIssuerEntries(readBack.entries),
      true,
      `${bank} lost its bank classification across the round trip`,
    );

    const verdict = classifyFundamentals(readBack);
    assert.equal(verdict.state, 'NOT_EVALUATED', `${bank} must not be scored by the non-bank rubric`);
    assert.deepEqual(verdict.clauses, [], `${bank} must not fire a leverage clause`);
  }
});

test('a real non-bank that is a genuine landmine is still caught after the round trip', () => {
  // The other direction: the round trip must not be so lossy that it quietly
  // sanitises a real veto away. If it did, a broken reader would look like a
  // SAFER system, which is the most dangerous failure mode of all.
  const available = calibrationFiles().map((f) => f.replace(/\.json$/, ''));
  const candidate = available.find((e) => e === 'POLY' || e === 'TBIG');
  assert.ok(candidate, 'no known landmine payload available — test would be vacuous');

  const payload: unknown = JSON.parse(readFileSync(join(CALIBRATION_DIR, `${candidate}.json`), 'utf8'));
  const series: ReplayKeystatsSeries = parseKeyStatsSeries(payload as never, candidate);
  assert.equal(series.isFinancialIssuer, false, `${candidate} should not be a financial issuer`);

  const readBack = rowsToKeystatsSeries({
    emiten: candidate,
    asOf: '2026-09-28',
    rows: series.entries.map((entry) => entryToRow(entry.itemName, entry)),
  });
  const verdict = classifyFundamentals(readBack);
  assert.equal(verdict.state, 'LANDMINE', `${candidate} lost its LANDMINE state across the round trip`);
  assert.ok(verdict.clauses.length > 0, `${candidate} lost its firing clauses across the round trip`);
});
