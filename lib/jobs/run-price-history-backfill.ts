/**
 * Price-history backfill job (original Phase 0 Task 11).
 *
 * Fills `price_history` for watchlist symbols without hammering the personal
 * Stockbit JWT: every request still goes through `stockbitFetch`'s global
 * limiter, and the BullMQ worker that runs this job has concurrency 1.
 *
 * This module is dependency-injected so the unit test never touches Stockbit,
 * Redis, or Postgres. The queue wiring in `lib/queue.ts` passes the real
 * implementations; the standalone CLI (`scripts/backfill-history.ts`) remains
 * an operator alternative.
 */

import { sessionDateJakarta } from '@/lib/market-calendar';
import { fetchWatchlist, fetchHistoricalSummaryPaged, type HistoricalSummaryItem } from '@/lib/stockbit';
import { chunkDateRange, dedupeHistoryByDate } from '@/lib/stockbit-history';
import {
  getCachedWatchlistGroups,
  getCachedWatchlistItems,
  upsertPriceHistory,
  createBackgroundJobLog,
  appendBackgroundJobLogEntry,
  updateBackgroundJobLog,
} from '@/lib/db';
import { resolveEmitensToAnalyze, type WatchlistUniverseItem } from './watchlist-universe';

export interface PriceHistoryBackfillInput {
  fromDate?: string;
  toDate?: string;
  symbols?: string[];
}

export interface PriceHistoryBackfillOutcome {
  success: boolean;
  symbols: number;
  bars: number;
  errors: number;
}

export interface PriceHistoryBackfillDeps {
  resolveSymbols?: (input: PriceHistoryBackfillInput) => Promise<string[]>;
  fetchBars?: (
    symbol: string,
    from: string,
    to: string
  ) => Promise<HistoricalSummaryItem[]>;
  upsert?: (rows: Array<Record<string, unknown>>) => Promise<unknown>;
  logs?: {
    create: (jobName: string, total: number) => Promise<{ id: number }>;
    append: (jobLogId: number, entry: Record<string, unknown>) => Promise<unknown>;
    complete: (jobLogId: number, patch: Record<string, unknown>) => Promise<unknown>;
  };
}

export async function resolveBackfillSymbols(
  input: PriceHistoryBackfillInput
): Promise<string[]> {
  if (input.symbols && input.symbols.length > 0) {
    return input.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  const items: WatchlistUniverseItem[] = [];
  const cachedGroups = await getCachedWatchlistGroups();
  for (const group of cachedGroups.groups) {
    const cached = await getCachedWatchlistItems(group.watchlist_id).catch(() => null);
    if (cached && cached.items.length > 0) {
      items.push(
        ...cached.items.map((item) => ({
          symbol: String(item.symbol ?? ''),
          company_code: String((item as { company_code?: string }).company_code ?? ''),
        })),
      );
      break;
    }
  }

  if (items.length === 0) {
    const response = await fetchWatchlist();
    items.push(
      ...(response.data?.result || []).map((item) => ({
        symbol: String(item.symbol || item.company_code || ''),
        company_code: String(item.company_code || item.symbol || ''),
      })),
    );
  }

  return resolveEmitensToAnalyze(items, process.env.WATCHLIST_FALLBACK_EMITENS).emitens;
}

function toPriceHistoryRows(symbol: string, bars: HistoricalSummaryItem[]): Array<Record<string, unknown>> {
  return bars.map((bar) => ({
    emiten: symbol,
    date: String(bar.date).slice(0, 10),
    open: bar.open ?? null,
    high: bar.high ?? null,
    low: bar.low ?? null,
    close: bar.close ?? null,
    volume: bar.volume ?? null,
    value: bar.value ?? null,
    frequency: bar.frequency ?? null,
    foreign_buy: bar.foreign_buy ?? null,
    foreign_sell: bar.foreign_sell ?? null,
    net_foreign: bar.net_foreign ?? null,
    average: bar.average ?? null,
  }));
}

export async function runPriceHistoryBackfill(
  input: PriceHistoryBackfillInput = {},
  deps: PriceHistoryBackfillDeps = {}
): Promise<PriceHistoryBackfillOutcome> {
  const resolveSymbols = deps.resolveSymbols ?? resolveBackfillSymbols;
  const fetchBars = deps.fetchBars ?? ((symbol, from, to) => fetchHistoricalSummaryPaged(symbol, from, to, 50));
  const upsert = deps.upsert ?? ((rows) => upsertPriceHistory(rows as unknown as Parameters<typeof upsertPriceHistory>[0]));
  const logs = deps.logs ?? {
    create: createBackgroundJobLog,
    append: appendBackgroundJobLogEntry,
    complete: updateBackgroundJobLog,
  };

  const fromDate = input.fromDate ?? '2019-01-01';
  const toDate = input.toDate ?? sessionDateJakarta(new Date());
  const symbols = await resolveSymbols(input);

  if (symbols.length === 0) {
    return { success: true, symbols: 0, bars: 0, errors: 0 };
  }

  let jobLogId: number | null = null;
  try {
    const jobLog = await logs.create('price-history-backfill', symbols.length);
    jobLogId = jobLog.id;
  } catch (error) {
    console.error('[Price History Backfill] Failed to create job log, continuing:', error);
  }

  let bars = 0;
  let errors = 0;

  for (const symbol of symbols) {
    try {
      const collected: HistoricalSummaryItem[] = [];
      for (const [from, to] of chunkDateRange(fromDate, toDate, 365)) {
        const window = await fetchBars(symbol, from, to);
        collected.push(...window);
      }
      const history = dedupeHistoryByDate(collected);
      if (history.length === 0) continue;
      const rows = toPriceHistoryRows(symbol, history);
      await upsert(rows);
      bars += rows.length;
    } catch (error) {
      errors += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Price History Backfill] ${symbol}: ${message}`);
      if (jobLogId) {
        await logs.append(jobLogId, {
          level: 'error',
          message,
          emiten: symbol,
        }).catch(() => {});
      }
    }
  }

  if (jobLogId) {
    await logs.complete(jobLogId, {
      status: errors > 0 ? 'failed' : 'completed',
      success_count: bars,
      error_message: errors > 0 ? `${errors} symbol(s) failed` : undefined,
    }).catch(() => {});
  }

  return { success: errors === 0, symbols: symbols.length, bars, errors };
}
