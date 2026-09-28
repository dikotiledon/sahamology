/**
 * Phase 4 G7 — the macro persistence and vendor-binding layer.
 *
 * Two responsibilities, both kept out of `lib/jobs/macro-capture.ts` so that
 * module stays testable with injected dependencies and no credentials:
 *
 *   1. `buildMacroPageFetcher` binds the real Stockbit historical-summary
 *      endpoint into the pager's `fetchPage` shape. This is the ONLY macro
 *      vendor call site in the codebase (root gate G5 asserts it), because the
 *      daily job loops the watchlist and a second call site would multiply the
 *      request count without bound.
 *   2. `saveMacroSnapshot` writes the captured bars into `macro_snapshot`.
 *
 * RAW BARS ONLY, never a verdict. The regime is classified at read time so a
 * threshold change re-scores history without a backfill (plan D7).
 */

import { fetchHistoricalSummaryPage } from '../stockbit';
import type { HistoricalRow, MacroSeries } from './types';

/**
 * Bind the vendor endpoint to the pager's `fetchPage` contract.
 *
 * The pager has already clamped `limit` to the measured 50 and the window to
 * the measured 365 days before this is called, so the query string this builds
 * is always inside the two limits that return HTTP 400 when exceeded.
 *
 * Rows are mapped defensively: the vendor's `date` is kept verbatim and the
 * numeric fields are coerced only when finite, so a malformed payload becomes
 * a row the pager's `toMacroBar` rejects rather than a NaN written to disk.
 */
export function buildMacroPageFetcher(): (args: {
  symbol: MacroSeries;
  startDate: string;
  endDate: string;
  limit: number;
  page: number;
}) => Promise<HistoricalRow[]> {
  return async ({ symbol, startDate, endDate, limit, page }) => {
    // `page` must be honoured, which is why this calls the page-aware
    // primitive rather than `fetchHistoricalSummary` (hard-coded to page 1).
    // Reusing that helper would make every page of a multi-page window return
    // the SAME first page: the pager's short-page stop would never fire, its
    // de-duplication would collapse everything to one page, and a backfill
    // would silently return a single page of history while reporting success.
    const items = await fetchHistoricalSummaryPage(symbol, startDate, endDate, limit, page);
    if (!Array.isArray(items)) return [];
    return items.map((item) => ({
      date: String(item?.date ?? ''),
      close: Number(item?.close),
      volume: Number(item?.volume),
      value: Number(item?.value),
    }));
  };
}

/** One row destined for `macro_snapshot`. Mirrors the job module's shape. */
export interface MacroSnapshotRow {
  symbol: string;
  barDate: string;
  close: number;
  volume: number;
  value: number;
  capturedAt: string;
}

/**
 * Persist a batch of macro bars.
 *
 * A single multi-row INSERT with `ON CONFLICT DO UPDATE` rather than one
 * statement per bar: the backfill writes hundreds of rows, and a per-row round
 * trip would turn a single capture into hundreds of database calls. `DO UPDATE`
 * (not `DO NOTHING`) because a re-capture of the same session should refresh
 * the close — the vendor revises a session's close, and `DO NOTHING` would keep
 * the first, possibly intraday, value forever.
 */
export async function saveMacroSnapshot(rows: MacroSnapshotRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { query } = await import('../db');
  const values: unknown[] = [];
  const tuples = rows.map((row, i) => {
    const base = i * 6;
    values.push(row.symbol, row.barDate, row.close, row.volume, row.value, row.capturedAt);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });
  await query(
    `INSERT INTO macro_snapshot (symbol, bar_date, close, volume, value, captured_at)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (symbol, bar_date) DO UPDATE
       SET close = EXCLUDED.close,
           volume = EXCLUDED.volume,
           value = EXCLUDED.value,
           captured_at = EXCLUDED.captured_at`,
    values,
  );
}
