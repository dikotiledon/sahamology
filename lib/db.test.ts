import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  serializeJsonColumns,
  coerceJournalRow,
  SQL_LIST_DECISION_JOURNAL_BY_DATE,
  SQL_LIST_LATEST_DECISION_JOURNAL_BY_EMITEN,
  SQL_LIST_UNSCORED_ENTER_JOURNAL,
  SQL_UPDATE_DECISION_JOURNAL_OUTCOME,
} from './db';

// Regression test for the node-postgres jsonb serialization bug.
//
// When a raw JS array is bound as a parameter for a json/jsonb column,
// node-postgres serializes it as a Postgres ARRAY literal
// (e.g. {"{...}","{...}"}) instead of a JSON literal, and PostgreSQL rejects
// it with `invalid input syntax for type json`. Plain objects are fine, but
// arrays are not — so every object/array value for a JSON column must be
// JSON.stringify'd before binding.
test('serializeJsonColumns stringifies arrays/objects for jsonb columns', () => {
  const entries = serializeJsonColumns({
    status: 'completed',
    matriks_story: [{ kategori_story: 'Aksi Korporasi' }],
    swot_analysis: { strengths: ['s'] },
    checklist_katalis: [{ item: 'i' }],
    sources: [{ title: 'Reuters', uri: 'https://example.com' }],
    keystat_signal: 'Positif/Sehat',
    kesimpulan: 'Kesimpulan uji.',
    model: null,
    thinking_level: null,
  });

  const byColumn = Object.fromEntries(entries.map(([column, value]) => [String(column), value]));

  // jsonb columns: values are sent as JSON strings, not raw arrays/objects.
  assert.equal(typeof byColumn.matriks_story, 'string');
  assert.equal(typeof byColumn.swot_analysis, 'string');
  assert.equal(typeof byColumn.checklist_katalis, 'string');
  assert.equal(typeof byColumn.sources, 'string');

  assert.deepEqual(JSON.parse(byColumn.matriks_story as string), [{ kategori_story: 'Aksi Korporasi' }]);
  assert.deepEqual(JSON.parse(byColumn.swot_analysis as string), { strengths: ['s'] });
  assert.deepEqual(JSON.parse(byColumn.sources as string), [{ title: 'Reuters', uri: 'https://example.com' }]);

  // Scalar columns stay untouched.
  assert.equal(byColumn.keystat_signal, 'Positif/Sehat');
  assert.equal(byColumn.kesimpulan, 'Kesimpulan uji.');
  assert.equal(byColumn.status, 'completed');
  assert.equal(byColumn.model, null);
  assert.equal(byColumn.thinking_level, null);
});

test('serializeJsonColumns drops undefined values and keeps null scalars', () => {
  const entries = serializeJsonColumns({
    status: 'error',
    error_message: undefined,
    kesimpulan: undefined,
    model: null,
  });

  const columns = entries.map(([column]) => String(column));
  assert.deepEqual(columns, ['status', 'model']);
});

test('serializeJsonColumns stringifies decision_journal gates jsonb', () => {
  const entries = serializeJsonColumns({
    emiten: 'BBRI',
    as_of: '2026-09-25',
    stance: 'ENTER',
    gates: [{ id: 'G0', pass: true, reason: 'ok' }],
    failed_gates: ['G2'],
  });

  const byColumn = Object.fromEntries(entries.map(([c, v]) => [String(c), v]));

  assert.equal(typeof byColumn.gates, 'string');
  assert.deepEqual(JSON.parse(byColumn.gates as string), [{ id: 'G0', pass: true, reason: 'ok' }]);
  // text[] stays a JS array for the pg driver
  assert.deepEqual(byColumn.failed_gates, ['G2']);
  assert.equal(byColumn.emiten, 'BBRI');
});

test('serializeJsonColumns stringifies strategi_trading jsonb', () => {
  const entries = serializeJsonColumns({
    status: 'completed',
    strategi_trading: { tipe_saham: 'Growth', catalyst_bias: 'dukung', invalidating_events: ['rights issue'] },
  });

  const byColumn = Object.fromEntries(entries.map(([c, v]) => [String(c), v]));

  assert.equal(typeof byColumn.strategi_trading, 'string');
  assert.deepEqual(JSON.parse(byColumn.strategi_trading as string), {
    tipe_saham: 'Growth',
    catalyst_bias: 'dukung',
    invalidating_events: ['rights issue'],
  });
});

test('desk SQL readers filter by as_of and order by emiten', () => {
  assert.match(SQL_LIST_DECISION_JOURNAL_BY_DATE, /WHERE as_of = \$1/);
  assert.match(SQL_LIST_DECISION_JOURNAL_BY_DATE, /ORDER BY emiten/);
});

test('latest-by-emiten reader is DISTINCT ON emiten ordered by as_of desc', () => {
  assert.match(SQL_LIST_LATEST_DECISION_JOURNAL_BY_EMITEN, /DISTINCT ON \(emiten\)/);
  assert.match(SQL_LIST_LATEST_DECISION_JOURNAL_BY_EMITEN, /ORDER BY emiten, as_of DESC/);
});

test('unscored ENTER query is stance ENTER and outcome IS NULL', () => {
  assert.match(SQL_LIST_UNSCORED_ENTER_JOURNAL, /stance = 'ENTER'/);
  assert.match(SQL_LIST_UNSCORED_ENTER_JOURNAL, /outcome IS NULL/);
});

test('outcome updater is gated on outcome IS NULL and returns the row', () => {
  assert.match(SQL_UPDATE_DECISION_JOURNAL_OUTCOME, /WHERE id = \$3 AND outcome IS NULL/);
  assert.match(SQL_UPDATE_DECISION_JOURNAL_OUTCOME, /RETURNING \*/);
});

test('outcome updater executes the exported SQL const, not a second copy', () => {
  const src = readFileSync(join(process.cwd(), 'lib', 'db.ts'), 'utf8');
  const start = src.indexOf('export async function updateDecisionJournalOutcome');
  const end = src.indexOf('export async function saveWatchlistAnalysis');
  assert.ok(start >= 0 && end > start);
  const body = src.slice(start, end);
  assert.match(body, /query\(\s*SQL_UPDATE_DECISION_JOURNAL_OUTCOME/);
  assert.doesNotMatch(body, /UPDATE decision_journal/);
});

test('coerceJournalRow turns pg NUMERIC strings into finite numbers', () => {
  const row = coerceJournalRow({
    emiten: 'bbca',
    as_of: '2026-01-05',
    entry: '1000',
    r1: '1050',
    max: '1100',
    invalidation: '950',
    rr: '1.80',
    r_multiple: '0.8500',
    outcome: null,
    failed_gates: ['G2'],
  });
  assert.equal(row.emiten, 'BBCA');
  assert.equal(row.entry, 1000);
  assert.equal(row.invalidation, 950);
  assert.equal(row.rr, 1.8);
  assert.equal(row.r_multiple, 0.85);
  assert.equal(row.outcome, null);
  assert.deepEqual(row.failed_gates, ['G2']);
});
