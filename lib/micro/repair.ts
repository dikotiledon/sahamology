/**
 * D18 repair contract (plan M22, acceptance criterion 5).
 *
 * Audit finding F2: the daily job skips any session that already has a
 * `stock_queries` row, so ONE transient vendor failure wrote a NULL-micro row
 * and that signal was then permanently unscored for system (3) — while
 * D10(7)'s `unscoredShare` counted exactly those rows, so an outage degraded
 * the gate's own coverage condition and the surviving sample silently became
 * the easy one.
 *
 * D18 is the fix, and its entire value is this promise: a repair completes a
 * capture, it never restates a decision. The row already recorded a stance, so
 * writing price or targets again would rewrite history rather than fill a gap.
 *
 * The SQL lives here, in `lib/`, rather than inline in the CLI script for one
 * reason: the test script only globs test files under `lib`, so a test sitting
 * next to a CLI script in `scripts` would never run in CI. The invariant is
 * the point, so it is asserted where CI will actually see it.
 */

/** Columns the repair is allowed to write. Everything else is read-only. */
export const REPAIRABLE_COLUMNS = [
  'accdist_overall',
  'accdist_top1',
  'accdist_top3',
  'accdist_top5',
  'accdist_avg',
  'broker_total_buyer',
  'broker_total_seller',
  'capture_incomplete',
] as const;

/**
 * Columns that define the original trade decision. A repair must never touch
 * any of these: a re-captured micro reading changes what the GATES would say,
 * but the row already recorded a stance, and rewriting that would silently
 * restate history. Exported so a unit test can prove the UPDATE below cannot
 * reach them.
 */
export const IMMUTABLE_DECISION_COLUMNS = [
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
  'status',
] as const;

/**
 * The repair UPDATE, isolated so its column set is directly assertable.
 *
 * D18's whole value rests on this statement touching micro columns and nothing
 * else. Keeping it as a named constant (rather than inline SQL) is what lets
 * the test suite prove the invariant instead of trusting a code review.
 */
export const REPAIR_UPDATE_SQL = `UPDATE stock_queries
   SET accdist_overall = $3, accdist_top1 = $4, accdist_top3 = $5,
       accdist_top5 = $6, accdist_avg = $7,
       broker_total_buyer = $8, broker_total_seller = $9,
       capture_incomplete = FALSE
 WHERE emiten = $1 AND from_date = $2`;

/** Only rows the daily job degraded are ever candidates. */
export const REPAIR_SELECT_SQL = `SELECT emiten, from_date, bandar, capture_incomplete
       FROM stock_queries
      WHERE status = 'success'
        AND capture_incomplete = TRUE
        AND from_date <= CURRENT_DATE
      ORDER BY from_date DESC
      LIMIT $1`;

/** Why a candidate row cannot be repaired, or null when it can. */
export function repairBlocker(bandar: string | null | undefined): string | null {
  const band = (bandar ?? '').toString().trim();
  return band === '' ? 'no band recorded; G1 would have blocked' : null;
}
