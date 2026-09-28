/**
 * Historical OHLCV backfill for the price_history table.
 *
 * Usage (from repo root):
 *   npm run backfill:history -- --start 2020-01-02 --end 2026-09-25 [--symbols BBRI,TLKM]
 *
 * Defaults:
 *   --start: 2020-01-02 (earliest plausible IDX session)
 *   --end:   today
 *   --symbols: every emiten already tracked by the pipeline
 *              (stock_queries ∪ emiten_cache), or a comma-separated override.
 *
 * Each symbol is fetched with the paged historical-summary API (limit 50/day,
 * the Stockbit endpoint maximum). The requested span is split into at-most
 * 365-calendar-day windows because the endpoint accepts ~1 year of lookback
 * per request; overlapping chunk boundaries are deduped by date.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchHistoricalSummaryPaged, HistoricalSummaryItem } from '../lib/stockbit';
import { chunkDateRange, dedupeHistoryByDate } from '../lib/stockbit-history';
import { getTrackedEmitens, upsertPriceHistory } from '../lib/db';

// Minimal .env.local loader (mirrors scripts/run-migrations.js) so
// DATABASE_URL / STOCKBIT_JWT_TOKEN are present for local CLI runs.
try {
  const envContent = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([^#=]+?)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env.local may not exist.
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const startDate = option('--start', '2020-01-02');
  const endDate = option('--end', new Date().toISOString().slice(0, 10));
  const symbolsArg = option('--symbols', '');

  const symbols = symbolsArg
    ? symbolsArg.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean)
    : await getTrackedEmitens();

  if (symbols.length === 0) {
    console.error('No symbols to backfill. Pass --symbols BBRI,TLKM or track at least one emiten first.');
    process.exit(1);
  }

  const chunks = chunkDateRange(startDate, endDate, 365);
  if (chunks.length === 0) {
    console.error(`Invalid date range: ${startDate} .. ${endDate}`);
    process.exit(1);
  }

  console.log(
    `Backfilling ${symbols.length} symbols from ${startDate} to ${endDate} in ${chunks.length} window(s)`
  );
  let inserted = 0;

  for (const symbol of symbols) {
    try {
      const collected: HistoricalSummaryItem[] = [];
      for (const [from, to] of chunks) {
        const bars = await fetchHistoricalSummaryPaged(symbol, from, to, 50);
        collected.push(...bars);
      }
      const bars = dedupeHistoryByDate(collected);
      if (bars.length === 0) {
        console.log(`  ${symbol}: no bars`);
        continue;
      }
      const rows = bars.map((bar) => ({
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
      await upsertPriceHistory(rows);
      inserted += rows.length;
      console.log(`  ${symbol}: ${rows.length} bars (${rows[0]?.date}..${rows[rows.length - 1]?.date})`);
    } catch (error) {
      console.error(`  ${symbol}: FAILED — ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`Done. ${inserted} bars upserted across ${symbols.length} symbols.`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
