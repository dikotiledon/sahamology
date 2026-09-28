/**
 * Watchlist universe partitioning for the daily analysis job.
 *
 * The Stockbit "All Watchlist" can hold instruments that are not IDX equities
 * (for example the USDIDR forex pair). Those rows can never yield an IDX
 * stock_queries signal, so the daily job must not count them as emitens, and it
 * must report why a trading day produced nothing instead of failing silently.
 */

export interface WatchlistUniverseItem {
  symbol?: string | null;
  company_code?: string | null;
}

export type WatchlistSkipReason = 'non-idx' | 'no-symbol';

export interface SkippedWatchlistItem {
  symbol: string;
  reason: WatchlistSkipReason;
}

export interface WatchlistUniverse {
  /** Distinct, normalized IDX emiten codes to analyze. */
  emitens: string[];
  /** Items deliberately not analyzed, with the reason. */
  skipped: SkippedWatchlistItem[];
}

/**
 * Non-IDX instrument codes observed in the watchlist. IDX emiten are
 * 4-letter Indonesian stock tickers; forex/commodity pairs carry a currency or
 * slash-style code instead.
 */
const NON_IDX_CODES = new Set(['USDIDR', 'EURUSD', 'GBPUSD', 'AUDUSD', 'USDJPY', 'USDJPY', 'XAUUSD', 'XAGUSD']);

function normalize(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Heuristic: IDX emiten are alphabetic tickers, not currency/commodity pairs. */
function isIdxEmiten(code: string): boolean {
  if (NON_IDX_CODES.has(code)) return false;
  if (!/^[A-Z]{4}$/.test(code)) return false;
  return true;
}

export function partitionWatchlistUniverse(
  items: readonly WatchlistUniverseItem[]
): WatchlistUniverse {
  const seen = new Set<string>();
  const emitens: string[] = [];
  const skipped: SkippedWatchlistItem[] = [];

  for (const item of items) {
    const raw = item?.symbol ?? item?.company_code ?? '';
    const code = normalize(String(raw ?? ''));

    if (!code) {
      skipped.push({ symbol: '', reason: 'no-symbol' });
      continue;
    }
    if (!isIdxEmiten(code)) {
      skipped.push({ symbol: code, reason: 'non-idx' });
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    emitens.push(code);
  }

  return { emitens, skipped };
}

export type EmitensSource = 'stockbit-watchlist' | 'env-fallback' | 'union' | 'none';

export interface ResolvedEmitens {
  /** Distinct IDX emiten codes to analyze, in stable order. */
  emitens: string[];
  /** Non-IDX / unusable watchlist items, retained for diagnostics. */
  skipped: SkippedWatchlistItem[];
  /** Where the final emiten list came from. */
  source: EmitensSource;
  /** Emiten contributed by the env fallback, for logging. */
  fallbackEmitens: string[];
}

/** Parse a comma/whitespace separated emiten list from configuration. */
export function parseEmitenList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[,\s]+/)) {
    const code = normalize(part);
    if (!code || !isIdxEmiten(code) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * Decide which emitens the daily job analyzes.
 *
 * The Stockbit watchlist is the primary source. When it contains no usable IDX
 * emiten (a common state, e.g. a watchlist holding only USDIDR), an operator-
 * configured fallback list keeps the daily job productive instead of silently
 * producing nothing. When both exist, the union is used.
 */
export function resolveEmitensToAnalyze(
  items: readonly WatchlistUniverseItem[],
  fallbackRaw: string | undefined | null
): ResolvedEmitens {
  const watchlist = partitionWatchlistUniverse(items);
  const fallback = parseEmitenList(fallbackRaw);

  if (watchlist.emitens.length === 0 && fallback.length === 0) {
    return { emitens: [], skipped: watchlist.skipped, source: 'none', fallbackEmitens: [] };
  }
  if (watchlist.emitens.length === 0) {
    return {
      emitens: fallback,
      skipped: watchlist.skipped,
      source: 'env-fallback',
      fallbackEmitens: fallback,
    };
  }
  if (fallback.length === 0) {
    return {
      emitens: watchlist.emitens,
      skipped: watchlist.skipped,
      source: 'stockbit-watchlist',
      fallbackEmitens: [],
    };
  }

  const merged = [...watchlist.emitens];
  const seen = new Set(merged);
  for (const code of fallback) {
    if (seen.has(code)) continue;
    seen.add(code);
    merged.push(code);
  }
  return {
    emitens: merged,
    skipped: watchlist.skipped,
    source: 'union',
    fallbackEmitens: fallback,
  };
}

/**
 * Emitens that already produced a signal for the resolved session date.
 *
 * `sessionDateJakarta` rolls back over weekends and holidays, so a run on a
 * non-trading day resolves to the last CLOSED session. Without this filter the
 * job would re-analyze that date and — because saveWatchlistAnalysis upserts on
 * (from_date, emiten) — silently OVERWRITE a real close-of-day signal with a
 * stale one instead of leaving it intact.
 *
 * Matching is case- and whitespace-insensitive so a ticker stored as 'bbca'
 * still suppresses the 'BBCA' run.
 */
export function selectUncapturedEmitens(
  emitens: readonly string[],
  capturedRows: ReadonlyArray<{ emiten?: string | null }>
): string[] {
  const captured = new Set<string>();
  for (const row of capturedRows) {
    const code = normalize(String(row?.emiten ?? ''));
    if (code) captured.add(code);
  }
  return emitens.filter((code) => !captured.has(normalize(code)));
}

/** Count of emitens suppressed because the session was already recorded. */
export function countCapturedEmitens(
  emitens: readonly string[],
  capturedRows: ReadonlyArray<{ emiten?: string | null }>
): number {
  return emitens.length - selectUncapturedEmitens(emitens, capturedRows).length;
}
