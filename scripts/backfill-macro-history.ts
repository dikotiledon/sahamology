/**
 * Backfill `macro_snapshot` from the live Stockbit historical-summary endpoint.
 *
 * Leaf 1.2.2 needs real macro history to measure against; a correlation study
 * cannot honestly publish a distribution from a table holding zero rows. This
 * is the one-off that fills it, kept separate from the daily job so a long
 * backfill never runs on a schedule.
 *
 * It goes through the SAME bounded pager the daily capture uses, so a backfill
 * cannot exceed the two measured vendor limits (limit<=50, span<=365d) any more
 * than the daily run can.
 *
 * USAGE:
 *   STOCKBIT_JWT_TOKEN=... npx tsx --tsconfig tsconfig.test.json \
 *     scripts/backfill-macro-history.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *
 * The token is read from the environment. It is never printed and never written
 * to disk.
 *
 * WHY IT CALLS THE ENDPOINT DIRECTLY rather than through `lib/stockbit`: that
 * module's `getAuthToken` checks the DATABASE first and only falls back to the
 * environment. On the WSL dev host the published Postgres port is not routable,
 * so a database-first lookup stalls until it times out. This script takes the
 * token from the environment and passes the header in, so a backfill on the dev
 * host does not depend on a port it cannot reach.
 */

import { fetchMacroSeriesPaged, toMacroBar } from '../lib/macro/capture';
import { saveMacroSnapshot } from '../lib/macro/store';
import { MACRO_SERIES, type HistoricalRow, type MacroSeries } from '../lib/macro/types';
import { stockbitFetch } from '../lib/stockbit-limiter';

const BASE_URL = 'https://exodus.stockbit.com';

const DEFAULT_FROM = '2025-06-01';
const DEFAULT_TO = new Date().toISOString().slice(0, 10);

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const headers = (token: string) => ({
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  origin: 'https://stockbit.com',
  referer: 'https://stockbit.com/',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
});

async function main(): Promise<void> {
  const from = arg('from') ?? DEFAULT_FROM;
  const to = arg('to') ?? DEFAULT_TO;
  const token = process.env.STOCKBIT_JWT_TOKEN?.trim();
  if (!token) {
    throw new Error('STOCKBIT_JWT_TOKEN is required (read it from the session row, never committed)');
  }

  const fetchPage = async (args: {
    symbol: MacroSeries;
    startDate: string;
    endDate: string;
    limit: number;
    page: number;
  }): Promise<HistoricalRow[]> => {
    const url =
      `${BASE_URL}/company-price-feed/historical/summary/${args.symbol}` +
      `?period=HS_PERIOD_DAILY&start_date=${args.startDate}&end_date=${args.endDate}` +
      `&limit=${args.limit}&page=${args.page}`;
    const response = await stockbitFetch(url, { method: 'GET', headers: headers(token) });
    if (!response.ok) {
      throw new Error(`${args.symbol} page ${args.page} -> HTTP ${response.status}`);
    }
    const json = (await response.json()) as { data?: { result?: Array<Record<string, unknown>> } };
    const items = json.data?.result;
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      date: String(item?.date ?? ''),
      close: Number(item?.close),
      volume: Number(item?.volume),
      value: Number(item?.value),
    }));
  };

  const capturedAt = new Date().toISOString();
  const summary: Array<{ symbol: string; rows: number; first?: string; last?: string }> = [];

  for (const symbol of MACRO_SERIES as readonly MacroSeries[]) {
    const rows = await fetchMacroSeriesPaged(symbol, from, to, undefined, { fetchPage });
    const bars = rows
      .map((r) => toMacroBar(symbol, r, capturedAt))
      .filter((b): b is NonNullable<typeof b> => b !== null);
    if (bars.length > 0) await saveMacroSnapshot(bars);
    summary.push({
      symbol,
      rows: bars.length,
      first: bars[0]?.barDate,
      last: bars[bars.length - 1]?.barDate,
    });
    console.log(
      `${symbol}: ${bars.length} bar(s) ${bars[0]?.barDate ?? '-'} .. ${bars[bars.length - 1]?.barDate ?? '-'}`,
    );
  }

  const total = summary.reduce((a, s) => a + s.rows, 0);
  console.log(`BACKFILL_TOTAL=${total} FROM=${from} TO=${to} SERIES=${summary.length}`);
  if (total === 0) {
    console.error('backfill produced no rows — refusing to report success');
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('backfill-macro-history failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
