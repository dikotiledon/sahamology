/**
 * Phase 4 G7 — the macro capture boundary.
 *
 * This module owns every macro vendor call. Nothing else in the codebase is
 * allowed to name a macro symbol against the Stockbit API (root gate G5
 * asserts it), because the daily job loops the watchlist per-emiten and a
 * fetch inside that loop would multiply one macro read by the watchlist size
 * and exhaust the rate limiter on every run (plan D5).
 *
 * The pager is the whole reason this file is not a one-liner. Two vendor
 * limits were MEASURED on 2026-09-28 with the operator's own JWT, and both
 * fail loudly rather than degrading:
 *
 *   - `limit=51` returns HTTP 400 `INVALID_PARAMETER`. `limit=50` returns 200.
 *   - a `start_date`..`end_date` window wider than ~365 days returns HTTP 400
 *     `INVALID_PARAMETER` regardless of `limit` or `page`.
 *
 * So "just ask for more with a bigger limit" is not an option, and "ask for
 * more with a wider window" is not an option either. Deep history is only
 * reachable by stepping BACKWARDS in bounded windows — which is what
 * `fetchMacroSeriesPaged` does, and the reason the pagination loop and the
 * window loop are separate: the vendor bounds both dimensions independently.
 *
 * PURE WHERE IT CAN BE: the date-window arithmetic is exported as a pure
 * helper and tested with no HTTP, no clock, and no database. Only the thin
 * fetch wrapper touches the network.
 */

import {
  MACRO_FETCH_LIMIT,
  MACRO_MAX_SPAN_DAYS,
  type HistoricalRow,
  type MacroSeries,
} from './types';

/** Injectable dependencies, so every test runs without network or credentials. */
export interface MacroFetchDeps {
  /** Returns one page of rows for the given inclusive window. */
  fetchPage: (args: {
    symbol: MacroSeries;
    startDate: string;
    endDate: string;
    limit: number;
    page: number;
  }) => Promise<HistoricalRow[]>;
}

/** Hard bound on pages per window. A vendor that always returns a full page
 *  must not spin forever; 50 pages x 50 rows = 2500 bars per window, far more
 *  than any window this module builds can hold. */
export const MACRO_MAX_PAGES_PER_WINDOW = 50;

/**
 * Hard bound on windows walked backwards.
 *
 * 12 windows x 365 days reaches ~4.4 years, which is more history than the
 * correlation study needs, and it means a bad `startDate` cannot walk back to
 * the epoch one window per request.
 */
export const MACRO_MAX_WINDOWS = 12;

const MS_PER_DAY = 86_400_000;

const parseDate = (value: string): Date => {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid date: ${value}`);
  return parsed;
};

/** `YYYY-MM-DD` for a Date, in UTC. Never uses the local clock. */
export const ymd = (date: Date): string => date.toISOString().slice(0, 10);

/** Inclusive day count from `from` to `to`. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / MS_PER_DAY);

/**
 * Split [from, to] into inclusive windows of at most `MACRO_MAX_SPAN_DAYS`
 * days, ordered NEWEST FIRST.
 *
 * Newest-first because the most recent data is what the live regime read needs,
 * and because a partial failure at the far end of history should cost the
 * oldest data, not the newest. The final window absorbs the remainder, so the
 * union of the windows is exactly [from, to] with no gap and no overlap.
 *
 * Pure: no clock, no network, no database. A window longer than the cap would
 * return HTTP 400 from the vendor, so this is the only place that arithmetic
 * is allowed to happen.
 */
export function planBackfillWindows(
  from: string,
  to: string,
  capDays: number = MACRO_MAX_SPAN_DAYS,
): Array<{ startDate: string; endDate: string }> {
  const cap = Math.max(1, Math.trunc(capDays));
  const total = daysBetween(from, to);
  if (total < 0) throw new Error(`from ${from} is after to ${to}`);

  const windows: Array<{ startDate: string; endDate: string }> = [];
  let cursor = parseDate(to);
  const floor = parseDate(from);

  while (cursor.getTime() >= floor.getTime()) {
    const start = new Date(cursor.getTime() - (cap - 1) * MS_PER_DAY);
    const clampedStart = start.getTime() < floor.getTime() ? floor : start;
    windows.push({ startDate: ymd(clampedStart), endDate: ymd(cursor) });

    if (clampedStart.getTime() <= floor.getTime()) break;
    // Step one day BEHIND the window just emitted, so consecutive windows are
    // adjacent rather than overlapping on that day.
    cursor = new Date(clampedStart.getTime() - MS_PER_DAY);
  }

  return windows;
}

/**
 * Walk one macro series backwards from `endDate` to `startDate`, in bounded
 * windows, and return every row found, oldest first.
 *
 * `limit` is CLAMPED to `MACRO_FETCH_LIMIT` rather than trusted. A caller that
 * asks for 500 gets 50: the vendor would 400 the whole request, and a silent
 * clamp turns a programming error into a working-but-short backfill, which is
 * the kind of failure that only shows up as a mysteriously short sample.
 *
 * Rows are de-duplicated by `barDate`. The windows are disjoint, so a duplicate
 * can only come from the vendor repeating a session across a boundary; a
 * duplicate in a keyed table would otherwise fail the insert for the whole
 * batch.
 */
export async function fetchMacroSeriesPaged(
  symbol: MacroSeries,
  startDate: string,
  endDate: string,
  limit: number = MACRO_FETCH_LIMIT,
  deps: MacroFetchDeps,
): Promise<HistoricalRow[]> {
  const pageSize = Math.min(Math.max(1, Math.trunc(limit)), MACRO_FETCH_LIMIT);
  const windows = planBackfillWindows(startDate, endDate).slice(0, MACRO_MAX_WINDOWS);

  const byDate = new Map<string, HistoricalRow>();
  for (const window of windows) {
    for (let page = 1; page <= MACRO_MAX_PAGES_PER_WINDOW; page += 1) {
      const rows = await deps.fetchPage({
        symbol,
        startDate: window.startDate,
        endDate: window.endDate,
        limit: pageSize,
        page,
      });
      if (!Array.isArray(rows)) break;
      for (const row of rows) {
        if (row && typeof row.date === 'string' && row.date) byDate.set(row.date, row);
      }
      // A short page is the vendor saying "that is all of them". Two other
      // things end the walk: a page that is not an array, and the hard page
      // bound. The loop is deliberately `page <= max`, never `for(;;)`.
      if (rows.length < pageSize) break;
    }
  }

  // Oldest first, so the classifier's baseline window reads the PRIOR sessions
  // at the tail and the newest bar at the head.
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Normalise one vendor row into a storable bar.
 *
 * Returns `null` for a row that cannot be trusted — a non-finite close, or a
 * missing date. A macro bar with no price is worse than no bar: it would be
 * stored as a real observation and then read as a regime input.
 */
export function toMacroBar(
  symbol: MacroSeries,
  row: HistoricalRow,
  capturedAt: string,
): { symbol: MacroSeries; barDate: string; close: number; volume: number; value: number; capturedAt: string } | null {
  if (!row || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return null;
  if (!Number.isFinite(row.close)) return null;
  return {
    symbol,
    barDate: row.date,
    close: row.close,
    volume: Number.isFinite(row.volume) ? row.volume : 0,
    value: Number.isFinite(row.value) ? row.value : 0,
    capturedAt,
  };
}
