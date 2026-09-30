import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPriceHistoryBackfill, type PriceHistoryBackfillDeps } from './run-price-history-backfill';
import { resolveEmitensToAnalyze } from './watchlist-universe';
import type { HistoricalSummaryItem } from '@/lib/stockbit';

function bar(date: string, close: number): HistoricalSummaryItem {
  return {
    date,
    close,
    change: 0,
    value: 1000,
    volume: 10,
    frequency: 5,
    foreign_buy: 2,
    foreign_sell: 1,
    net_foreign: 1,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    average: close,
    change_percentage: 0,
  };
}

function makeDeps() {
  const upserts: Array<Record<string, unknown>[]> = [];
  const logEntries: Array<{ jobLogId: number; entry: Record<string, unknown> }> = [];
  const completions: Array<{ jobLogId: number; patch: Record<string, unknown> }> = [];
  let nextLogId = 1;

  const deps: PriceHistoryBackfillDeps = {
    resolveSymbols: async () => ['BBRI', 'TLKM'],
    fetchBars: async (symbol: string) => {
      if (symbol === 'TLKM') throw new Error('boom');
      return [bar('2026-09-24', 105), bar('2026-09-25', 112)];
    },
    upsert: async (rows) => {
      upserts.push(rows);
    },
    logs: {
      create: async () => ({ id: nextLogId++ }),
      append: async (jobLogId, entry) => {
        logEntries.push({ jobLogId, entry });
      },
      complete: async (jobLogId, patch) => {
        completions.push({ jobLogId, patch });
      },
    },
  };

  return { upserts, logEntries, completions, deps };
}

test('two symbols: one throws, the other is still processed and upserted', async () => {
  const { upserts, deps } = makeDeps();
  const outcome = await runPriceHistoryBackfill({ fromDate: '2026-01-01', toDate: '2026-09-25' }, deps);

  assert.equal(outcome.success, false);
  assert.equal(outcome.symbols, 2);
  assert.equal(outcome.bars, 2);
  assert.equal(outcome.errors, 1);
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0][0], {
    emiten: 'BBRI',
    date: '2026-09-24',
    open: 104,
    high: 106,
    low: 103,
    close: 105,
    volume: 10,
    value: 1000,
    frequency: 5,
    foreign_buy: 2,
    foreign_sell: 1,
    net_foreign: 1,
    average: 105,
  });
});

test('empty symbol set reports zero without touching logs', async () => {
  const { upserts, logEntries, completions, deps } = makeDeps();
  deps.resolveSymbols = async () => [];
  const outcome = await runPriceHistoryBackfill({}, deps);

  assert.equal(outcome.success, true);
  assert.equal(outcome.symbols, 0);
  assert.equal(upserts.length, 0);
  assert.equal(logEntries.length, 0);
  assert.equal(completions.length, 0);
});

test('failed symbol logs an error entry and marks the job failed', async () => {
  const { logEntries, completions, deps } = makeDeps();
  await runPriceHistoryBackfill({}, deps);

  assert.ok(logEntries.some((e) => e.entry.message === 'boom' && e.entry.emiten === 'TLKM'));
  assert.equal(completions.length, 1);
  assert.equal(completions[0].patch.status, 'failed');
  assert.match(String(completions[0].patch.error_message), /1 symbol/);
});

test('default universe drops USDIDR via resolveEmitensToAnalyze', () => {
  const src = readFileSync(join(process.cwd(), 'lib', 'jobs', 'run-price-history-backfill.ts'), 'utf8');
  assert.match(src, /resolveEmitensToAnalyze/);
  const resolved = resolveEmitensToAnalyze(
    [{ symbol: 'USDIDR' }, { symbol: 'BBCA' }, { symbol: 'XAUUSD' }],
    undefined,
  );
  assert.deepEqual(resolved.emitens, ['BBCA']);
  assert.ok(resolved.skipped.some((item) => item.symbol === 'USDIDR' && item.reason === 'non-idx'));
});
