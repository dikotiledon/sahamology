/**
 * Phase 4 G7 — the daily macro capture.
 *
 * ONE capture per session, for the whole watchlist (plan D5). This is the
 * single most important cost property in the module: the daily job loops the
 * watchlist per-emiten, so a macro fetch inside that loop would multiply one
 * read by the watchlist size. The four legs are market-wide, not per-company —
 * there is nothing an individual emiten changes about where IHSG closed — so
 * capturing them once is not an optimisation, it is the only correct design.
 *
 * The governing property is D4, and it is stronger here than the Phase 3
 * equivalent. G7 fails OPEN: absent macro data downgrades the regime to
 * NOT_EVALUATED and leaves the stance untouched. So a macro outage costs
 * nothing but a label, while a macro failure that reached the job's error list
 * would abort or pollute the signal loop — deleting samples from the
 * walk-forward denominator, silently and in exactly the direction that
 * flatters results. Nothing here throws. Every path degrades to
 * `incomplete: true` and returns.
 *
 * It touches ONLY `macro_incomplete`. The micro and fundamentals flags are
 * independent repair scopes (Phase 3 D14): a day whose macro read failed but
 * whose tape and KeyStats reads succeeded is not incomplete in either of those
 * senses, and a `--macro` repair must not re-run the other two passes.
 *
 * Every dependency is injected, so this is testable with no network, no token
 * and no database.
 */

import { fetchMacroSeriesPaged, toMacroBar } from '../macro/capture';
import { MACRO_SERIES, type HistoricalRow, type MacroSeries } from '../macro/types';

/** One row destined for `macro_snapshot`. */
export interface MacroSnapshotRow {
  symbol: MacroSeries;
  barDate: string;
  close: number;
  volume: number;
  value: number;
  capturedAt: string;
}

export interface MacroCaptureResult {
  ok: boolean;
  /** Set when the signal must be marked `macro_incomplete` for repair. */
  incomplete: boolean;
  /** Per-series outcome, so one dead leg does not hide four working ones. */
  perSeries: Record<string, { ok: boolean; rows: number; error?: string }>;
  rowCount: number;
  error?: string;
}

export interface MacroCaptureDeps {
  /** Fetches one page. Defaults to the real bounded pager. */
  fetchPage: (args: {
    symbol: MacroSeries;
    startDate: string;
    endDate: string;
    limit: number;
    page: number;
  }) => Promise<HistoricalRow[]>;
  /** Persists the batch. Injected so the test needs no database. */
  saveSnapshot: (rows: MacroSnapshotRow[]) => Promise<unknown>;
  /** Injected so the test is deterministic — never reads the real clock. */
  capturedAt: string;
  /** How far back to backfill on a cold start. */
  from?: string;
  to?: string;
  /** Injected so the test can run a subset without touching the frozen set. */
  series?: readonly MacroSeries[];
}

/**
 * Capture every macro leg for one session.
 *
 * Never throws and never rejects. The whole-function contract is "returns a
 * result", because the caller is a job loop whose error list is a walk-forward
 * denominator, not a log.
 */
export async function captureMacro(deps: MacroCaptureDeps): Promise<MacroCaptureResult> {
  const series = deps.series ?? MACRO_SERIES;
  const perSeries: MacroCaptureResult['perSeries'] = {};
  const allRows: MacroSnapshotRow[] = [];
  let anyFailure = false;

  for (const symbol of series) {
    try {
      const rows = await fetchMacroSeriesPaged(symbol, deps.from!, deps.to!, undefined, {
        fetchPage: deps.fetchPage,
      });
      const bars = rows
        .map((row) => toMacroBar(symbol, row, deps.capturedAt))
        .filter((bar): bar is MacroSnapshotRow => bar !== null);
      allRows.push(...bars);
      perSeries[symbol] = { ok: true, rows: bars.length };
    } catch (error) {
      // One dead leg must not discard the other four: a partial capture is
      // still useful data, and marking the whole session incomplete is what
      // sends it to the repair pass.
      anyFailure = true;
      perSeries[symbol] = {
        ok: false,
        rows: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (allRows.length > 0) {
    try {
      await deps.saveSnapshot(allRows);
    } catch (error) {
      // The rows were fetched but could not be stored. That is a failure of
      // this capture, and it must be reported as one — a silent success here
      // would leave the regime reading a stale table forever.
      return {
        ok: false,
        incomplete: true,
        perSeries,
        rowCount: 0,
        error: `macro snapshot save failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  } else if (!anyFailure) {
    // No rows and no error: the vendor returned empty pages. That is not a
    // clean "nothing to report", it is a capture that achieved nothing.
    return {
      ok: false,
      incomplete: true,
      perSeries,
      rowCount: 0,
      error: 'macro capture returned no rows',
    };
  }

  return {
    ok: !anyFailure,
    incomplete: anyFailure,
    perSeries,
    rowCount: allRows.length,
    ...(anyFailure ? { error: 'one or more macro series failed' } : {}),
  };
}
