import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchHistoricalSummaryPaged } from './stockbit';

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
