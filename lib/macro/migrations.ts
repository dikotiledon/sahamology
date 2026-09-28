/**
 * Phase 4 — the CI-visible copy of the Phase 4 DDL.
 *
 * WHY THIS FILE EXISTS: `npm test` globs only files under `lib` ending in
 * `.test.ts`, so a schema regression living only in the `supabase` SQL files
 * would never fail CI. The SQL files remain the deployment artefact; these
 * constants are the assertable mirror of the same statements, and
 * `migrations.test.ts` pins their shape. A drift between the two is caught by
 * the test asserting the SQL files carry the same key clauses, so neither side
 * can quietly diverge.
 *
 * The rules that matter and are asserted below:
 *   - Additive only. No UPDATE, no DROP, no CREATE OR REPLACE anywhere.
 *   - No stored verdict. `macro_snapshot` holds raw vendor bars; the regime is
 *     classified at read time so a threshold change re-scores history without a
 *     backfill.
 *   - Idempotent. `IF NOT EXISTS` throughout, so a re-run is a no-op.
 */

/** DDL for `supabase/026_macro_snapshot.sql`. */
export const MACRO_SNAPSHOT_DDL = `
CREATE TABLE IF NOT EXISTS macro_snapshot (
  symbol      TEXT        NOT NULL,
  bar_date    DATE        NOT NULL,
  close       NUMERIC     NOT NULL,
  volume      NUMERIC     NOT NULL DEFAULT 0,
  value       NUMERIC     NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, bar_date)
);

CREATE INDEX IF NOT EXISTS idx_macro_snapshot_lookup
  ON macro_snapshot (symbol, bar_date DESC);
` as const;

/** DDL for `supabase/027_stock_queries_macro.sql`. */
export const MACRO_INCOMPLETE_DDL = `
ALTER TABLE stock_queries
  ADD COLUMN IF NOT EXISTS macro_incomplete BOOLEAN NOT NULL DEFAULT FALSE;
` as const;

/** The Phase 4 migration filenames, in deployment order. */
export const MACRO_MIGRATIONS = ['026_macro_snapshot.sql', '027_stock_queries_macro.sql'] as const;

/**
 * The Phase 3 set this phase builds on, in deployment order.
 *
 * Recorded as a constant rather than a filesystem scan so a test can prove the
 * Phase 4 numbers continue the existing sequence instead of colliding with it.
 */
export const DEPENDED_ON_MIGRATIONS = [
  '021_stock_queries_accdist.sql',
  '022_broker_flow_daily.sql',
  '023_capture_incomplete.sql',
  '024_stock_queries_fundamentals.sql',
  '025_keystats_snapshot.sql',
] as const;
