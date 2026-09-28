/**
 * D14 repair contract for fundamentals (the KeyStats half of capture repair).
 *
 * The Phase 2 micro repair lives in `lib/micro/repair.ts` and this file is its
 * exact mirror, deliberately. The two captures fail independently — a flow 429
 * says nothing about KeyStats, and a KeyStats timeout says nothing about the
 * orderbook — so they have separate flags, separate queries, and separate
 * repair scopes. Merging them would let one repair clear the other's flag and
 * hide a real gap behind a row that merely looks complete.
 *
 * THE INVARIANT, restated because it is the whole point: a repair completes a
 * capture, it never restates a decision. The row already recorded a stance, so
 * writing price or targets again would rewrite history rather than fill a gap.
 *
 * The SQL lives in `lib/`, not in `scripts/`, because the test glob only
 * matches test files under `lib/` — a test next to the CLI would never run in
 * CI, and the invariant is precisely what needs asserting.
 */

/**
 * Columns the fundamentals repair may write. Everything else on
 * `stock_queries` is read-only for this scope.
 */
export const FUNDAMENTALS_REPAIRABLE_COLUMNS = [
  // The one and only stock_queries column this scope writes. Clearing it is
  // the whole repair: the flag is a promise that the capture is complete, and
  // the snapshot rows themselves were written by the capture job.
  'fundamentals_incomplete',
] as const;

/**
 * Columns that define the original trade decision, plus every micro column.
 * A fundamentals repair must never reach any of them: a re-captured KeyStats
 * reading would change what the GATES would say about this row, but the row
 * already recorded a stance. `capture_incomplete` is listed explicitly because
 * it belongs to the OTHER scope — clearing it here would report a micro gap as
 * repaired when no micro fetch ever ran.
 */
export const FUNDAMENTALS_IMMUTABLE_COLUMNS = [
  'harga',
  'ara',
  'arb',
  'total_bid',
  'total_offer',
  'bandar',
  'barang_bandar',
  'rata_rata_bandar',
  'target_realistis',
  'target_max',
  'stance',
  'is_idx_session',
  // Phase 2 micro scope — not ours to clear.
  'accdist_overall',
  'accdist_top1',
  'accdist_top3',
  'accdist_top5',
  'accdist_avg',
  'broker_total_buyer',
  'broker_total_seller',
  'broker_p',
  'capture_incomplete',
] as const;

/** Repair scopes. Each writes only its own columns. */
export const REPAIR_SCOPES = ['micro', 'fundamentals'] as const;
export type RepairScope = (typeof REPAIR_SCOPES)[number];

/**
 * Which flag a scope keys on. Kept as a lookup rather than a template string so
 * that asking for the fundamentals scope cannot accidentally produce
 * `capture_incomplete` — the failure the D11 scope split exists to prevent.
 */
export const SCOPE_FLAG: Record<RepairScope, string> = {
  micro: 'capture_incomplete',
  fundamentals: 'fundamentals_incomplete',
};

/**
 * Select rows whose capture degraded in the requested scope.
 *
 * `as_of` is matched to `from_date` exactly, not by range: a KeyStats snapshot
 * is a point-in-time reading, and pairing it with any other date would be a
 * lookahead. Rows with no snapshot row at all are returned too — those are the
 * ones where the capture failed before it wrote anything, and they are the
 * rows most worth repairing.
 */
export const FUNDAMENTALS_REPAIR_SELECT_SQL = `
  SELECT q.from_date, q.emiten, q.fundamentals_incomplete
  FROM stock_queries q
  WHERE q.fundamentals_incomplete = true
  ORDER BY q.from_date DESC
  LIMIT $1
`;

/**
 * Clear the flag, and only the flag, once a snapshot exists for that exact
 * date. The `EXISTS` guard is the important part: the UPDATE is a no-op unless
 * the capture actually landed, so a failed re-fetch cannot mark a row repaired
 * on the strength of a retry that did nothing.
 */
export const FUNDAMENTALS_REPAIR_UPDATE_SQL = `
  UPDATE stock_queries q
  SET fundamentals_incomplete = false
  WHERE q.from_date = $1
    AND q.emiten = $2
    AND EXISTS (
      SELECT 1 FROM keystats_snapshot k
      WHERE k.as_of = q.from_date
        AND k.emiten = q.emiten
    )
`;

/**
 * Why a row cannot be repaired, if it cannot be.
 *
 * The vendor publishes no dated KeyStats history: the endpoint answers with a
 * CURRENT snapshot, so a past session's fundamental reading can only come from
 * what was captured that day. A row whose capture failed on a day now past
 * cannot honestly be backfilled — fetching now would grade a past decision
 * with present-day data, which is exactly the lookahead this whole phase is
 * built to exclude.
 *
 * The honest outcome for such a row is to stay unscored, forever. That is not a
 * bug to be worked around; it is the correct answer, and it is why the ship
 * gate carries an unscored cap rather than pretending coverage is complete.
 */
export type RepairBlockerReason = 'no-snapshot-after-retry' | 'vendor-parse-failure';

export interface RepairBlocker {
  reason: RepairBlockerReason;
  detail: string;
}

export function repairBlocker(
  reason: RepairBlockerReason,
  detail: string,
): RepairBlocker {
  return { reason, detail };
}

/**
 * The flag a scope clears, given the row it is about to clear.
 *
 * Exists so a caller cannot pass a mismatched (scope, flag) pair by hand and
 * clear a column that belongs to the other scope.
 */
export function flagForScope(scope: RepairScope): string {
  const flag = SCOPE_FLAG[scope];
  if (!flag) {
    throw new Error(`unknown repair scope: ${String(scope)}`);
  }
  return flag;
}
