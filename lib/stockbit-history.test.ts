import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchHistoricalSummaryPaged } from './stockbit';
import { chunkDateRange, dedupeHistoryByDate } from './stockbit-history';

test('pages until a short page then stops', async () => {
  const pages: unknown[][] = [
    [
      { date: '2026-09-24', close: 100 },
      { date: '2026-09-23', close: 99 },
    ],
    [{ date: '2026-09-22', close: 98 }],
    [],
  ];
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const page = pages[Math.min(calls.length - 1, pages.length - 1)];
    return new Response(JSON.stringify({ data: { result: page } }), { status: 200 });
  };
  const result = await fetchHistoricalSummaryPaged('BBRI', '2026-01-01', '2026-09-24', 2, {
    fetch: fetchImpl,
    getHeaders: async () => ({ Authorization: 'Bearer test' }),
  });
  assert.equal(result.length, 3);
  assert.equal(calls.length, 2);
  assert.match(calls[0], /page=1/);
  assert.match(calls[1], /page=2/);
});

test('empty first page returns immediately', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ data: { result: [] } }), { status: 200 });
  const result = await fetchHistoricalSummaryPaged('BBRI', '2026-01-01', '2026-09-24', 2, {
    fetch: fetchImpl,
    getHeaders: async () => ({ Authorization: 'Bearer test' }),
  });
  assert.equal(result.length, 0);
});

test('a 400-day span yields two chunks, each at most 365 days', () => {
  const chunks = chunkDateRange('2025-01-01', '2026-02-04', 365); // 400 days
  assert.equal(chunks.length, 2);
  for (const [start, end] of chunks) {
    const span = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000 + 1;
    assert.ok(span <= 365, `chunk ${start}..${end} spans ${span} days`);
  }
  assert.equal(chunks[0][0], '2025-01-01');
  assert.equal(chunks[1][1], '2026-02-04');
});

test('exactly 365 days is one chunk', () => {
  const chunks = chunkDateRange('2025-01-01', '2025-12-31', 365);
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], ['2025-01-01', '2025-12-31']);
});

test('start after end yields an empty array', () => {
  assert.deepEqual(chunkDateRange('2026-01-01', '2025-01-01'), []);
});

test('malformed dates yield an empty array', () => {
  assert.deepEqual(chunkDateRange('01-01-2025', '2025-12-31'), []);
});

test('dedupe keeps the first row per date', () => {
  const rows = [
    { date: '2026-01-02', close: 100 },
    { date: '2026-01-02', close: 999 },
    { date: '2026-01-03', close: 101 },
    { date: '2026-01-03', close: 888 },
  ];
  const deduped = dedupeHistoryByDate(rows);
  assert.deepEqual(deduped.map((r) => r.close), [100, 101]);
});

test('dedupe drops rows with no date', () => {
  const rows = [{ date: '', close: 1 }, { date: '2026-01-02', close: 2 }];
  assert.deepEqual(dedupeHistoryByDate(rows), [{ date: '2026-01-02', close: 2 }]);
});
