import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeJsonColumns } from './db';

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
    strategi_trading: { tipe_saham: 'value' },
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
  assert.equal(typeof byColumn.strategi_trading, 'string');
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
