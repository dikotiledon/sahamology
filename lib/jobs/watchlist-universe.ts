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
