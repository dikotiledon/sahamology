/**
 * Probe the live macro pager and record what it actually did.
 *
 * G10 asks a narrow question: does the bounded pager still reproduce the shape
 * that leaf 1.1.3 measured — limit clamped at 50, windows stepped backwards in
 * spans of 365 days or less, and, above all, NO HTTP 400 anywhere? The vendor
 * returns 400 INVALID_PARAMETER the moment either limit is exceeded, so a single
 * 400 in the transcript is the whole failure mode this gate exists to catch.
 *
 * It runs the SAME `fetchMacroSeriesPaged` the daily capture uses, through the
 * same window planner and the same limit clamp. A probe that reimplemented the
 * paging would prove nothing about the pager that ships.
 *
 * It writes NOTHING to the database. This is a measurement, not a backfill;
 * `scripts/backfill-macro-history.ts` is the script that persists. That split
 * matters: G10 must be safe to run any time, including while the daily job is
 * live, and a probe that wrote rows would make a routine check a mutation.
 *
 * WHY IT COUNTS NON-OK RESPONSES INSTEAD OF THROWING: the daily capture aborts
 * a series on the first non-OK response, which is right for a scheduled job
 * that has five chances tomorrow. Here the interesting number is the count of
 * 400s across a whole run, so a failure is tallied and reported rather than
 * thrown, and the process still exits non-zero if the shape is wrong.
 *
 * USAGE:
 *   STOCKBIT_JWT_TOKEN=... npx tsx --tsconfig tsconfig.test.json \
 *     scripts/macro-backfill-probe.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD]
 *
 * The token is read from the environment. It is never printed and never written
 * to disk, and the artifact records no header, no Authorization value and no
 * response body.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchMacroSeriesPaged } from '../lib/macro/capture';
import {
  MACRO_FETCH_LIMIT,
  MACRO_MAX_SPAN_DAYS,
  MACRO_SERIES,
  type HistoricalRow,
  type MacroSeries,
} from '../lib/macro/types';
import { stockbitFetch } from '../lib/stockbit-limiter';

const BASE_URL = 'https://exodus.stockbit.com';
const ARTIFACT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'artifacts', 'macro-backfill-probe.json');

// Long enough to prove multi-window paging (the default span is well over one
// window, so at least two backward steps must occur) and to clear the >= 200
// unique-date floor G10 asserts.
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

interface Tally {
  ok: number;
  http400: number;
  otherNonOk: number;
  requests: Array<{ symbol: string; page: number; start: string; end: string; limit: number; status: number }>;
}

async function main(): Promise<void> {
  const from = arg('from') ?? DEFAULT_FROM;
  const to = arg('to') ?? DEFAULT_TO;
  const token = process.env.STOCKBIT_JWT_TOKEN?.trim();
  if (!token) {
    throw new Error('STOCKBIT_JWT_TOKEN is required (read it from the session row, never committed)');
  }

  const tally: Tally = { ok: 0, http400: 0, otherNonOk: 0, requests: [] };

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
    tally.requests.push({
      symbol: args.symbol,
      page: args.page,
      start: args.startDate,
      end: args.endDate,
      limit: args.limit,
      status: response.status,
    });
    if (!response.ok) {
      if (response.status === 400) tally.http400 += 1;
      else tally.otherNonOk += 1;
      throw new Error(`${args.symbol} page ${args.page} -> HTTP ${response.status}`);
    }
    tally.ok += 1;
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

  const perSeries: Array<{
    symbol: string;
    rows: number;
    uniqueDates: number;
    first?: string;
    last?: string;
    error?: string;
  }> = [];

  for (const symbol of MACRO_SERIES as readonly MacroSeries[]) {
    try {
      const rows = await fetchMacroSeriesPaged(symbol, from, to, undefined, { fetchPage });
      const dates = new Set(rows.map((r) => r.date).filter((d) => d !== ''));
      perSeries.push({
        symbol,
        rows: rows.length,
        uniqueDates: dates.size,
        first: rows[0]?.date,
        last: rows[rows.length - 1]?.date,
      });
      console.log(`${symbol}: ${rows.length} row(s), ${dates.size} unique date(s)`);
    } catch (error) {
      perSeries.push({
        symbol,
        rows: 0,
        uniqueDates: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`${symbol}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const uniqueDates: Record<string, number> = {};
  for (const s of perSeries) uniqueDates[s.symbol] = s.uniqueDates;

  // Independently re-derive the two limits actually put on the wire. A probe
  // that only trusted the pager's own clamp could not detect the clamp being
  // removed from the request builder.
  const spansOk = tally.requests.every(
    (r) => r.limit <= MACRO_FETCH_LIMIT && daysBetween(r.start, r.end) <= MACRO_MAX_SPAN_DAYS,
  );

  const artifact = {
    recordedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    window: { from, to },
    limits: { fetchLimit: MACRO_FETCH_LIMIT, maxSpanDays: MACRO_MAX_SPAN_DAYS },
    requests: tally.requests.length,
    ok: tally.ok,
    http400: tally.http400,
    otherNonOk: tally.otherNonOk,
    spansWithinLimits: spansOk,
    uniqueDates,
    perSeries,
    transcript: tally.requests,
    note: 'Measurement only. No database writes. No token, header or response body is recorded.',
  };

  if (!existsSync(dirname(ARTIFACT))) mkdirSync(dirname(ARTIFACT), { recursive: true });
  writeFileSync(ARTIFACT, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(
    `PROBE requests=${tally.requests.length} ok=${tally.ok} http400=${tally.http400} ` +
      `otherNonOk=${tally.otherNonOk} spansWithinLimits=${spansOk}`,
  );

  const shortfall = perSeries.filter((s) => s.error);
  if (tally.http400 > 0) {
    console.error(`the pager produced ${tally.http400} HTTP 400 response(s) — a vendor limit was exceeded`);
    process.exit(1);
  }
  if (!spansOk) {
    console.error('a request went out with a limit or span beyond the measured vendor ceiling');
    process.exit(1);
  }
  if (shortfall.length > 0) {
    console.error(`${shortfall.length} series failed: ${shortfall.map((s) => s.symbol).join(', ')}`);
    process.exit(1);
  }
}

/** Inclusive calendar days between two YYYY-MM-DD strings. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error('macro-backfill-probe failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
