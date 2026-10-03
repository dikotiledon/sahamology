import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { hitR1, hitMax } from './hits';
import { ymdOf } from './date-ymd';
import { toFiniteNumber } from './desk/numbers';
import type { PathExit } from './playbook/path-outcome';
import type { BrokerFlowRow } from './micro/types';
import { rowsToKeystatsSeries } from './fundamentals/snapshot-rows';
import type { ReplayKeystatsSeries } from './playbook/replay';
import type { KeystatsSnapshotRow } from './fundamentals/snapshot-rows';

/**
 * Native PostgreSQL data access layer.
 *
 * This module replaces the previous PostgREST client with a single `pg`
 * connection pool bound to `DATABASE_URL`. Every exported function in
 * the old `lib/supabase.ts` is preserved here with an identical name, parameter
 * signature, and return-shape promise so that `app/**` callers keep working without
 * changes.
 *
 * The Supabase-specific behaviours that callers implicitly relied on are reproduced
 * deliberately:
 *   - `.single()` with no rows  -> `null`
 *   - `upsert(..., { onConflict })` -> `INSERT ... ON CONFLICT ... DO UPDATE`
 *   - PostgREST resource embed -> SQL JOIN
 *   - `append_job_log_entry` RPC -> `SELECT append_job_log_entry($1, $2::jsonb)`
 *   - `.not('col','in','(a,b)')` -> `NOT (col = ANY($1::int[]))`
 */

export interface QueryResultRowLike extends QueryResultRow {
  [column: string]: unknown;
}

const DATABASE_URL = process.env.DATABASE_URL;
const DB_MAX_CONNECTIONS = Number(process.env.DB_MAX_CONNECTIONS || 10);

let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    if (!DATABASE_URL) {
      throw new Error(
        'DATABASE_URL is required. Configure a PostgreSQL connection string, e.g. postgresql://user:pass@localhost:5432/sahamology'
      );
    }
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: Number.isFinite(DB_MAX_CONNECTIONS) && DB_MAX_CONNECTIONS > 0 ? DB_MAX_CONNECTIONS : 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'sahamology',
    });

    // Avoid crashing the process on idle client errors; let callers surface query errors.
    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err.message);
    });
  }
  return pool;
}

/** Run a parameterized query and return the raw pg result. */
export async function query<T extends QueryResultRow = QueryResultRowLike>(
  text: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

/** Run `fn` inside a transaction. Rolls back on any thrown error. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** First row of a query result, or null when there are no rows.
 *  Returned as `any` to match the old Supabase client's row typing. */
function first<T extends QueryResultRow = QueryResultRowLike>(result: QueryResult<T>): any {
  return (result.rows[0] as T | undefined) ?? null;
}

/** Convert a pg error object to a Supabase-like error shape (code + message). */
function toError(error: unknown): { code?: string; message: string } {
  if (error instanceof Error) {
    return { code: (error as Error & { code?: string }).code, message: error.message };
  }
  return { message: String(error) };
}

// =====================================================================
// Stock queries
// =====================================================================

type StockQueryInput = Record<string, unknown> & {
  emiten: string;
  from_date?: string;
  to_date?: string;
};

function buildUpsert(table: string, conflict: string, data: Record<string, unknown>) {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  const columns = entries.map(([column]) => column);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const updateAssignments = columns
    .filter((column) => column !== conflict.split(',')[0].trim())
    .map((column) => `${column} = EXCLUDED.${column}`);
  const conflictTarget = conflict
    .split(',')
    .map((column) => column.trim())
    .join(', ');

  return {
    text: `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (${conflictTarget})
      DO UPDATE SET ${updateAssignments.join(', ')}
      RETURNING *
    `,
    values,
  };
}

/** Save stock query (one record per emiten per from_date). */
export async function saveStockQuery(data: StockQueryInput) {
  const { text, values } = buildUpsert('stock_queries', 'from_date,emiten', data);
  try {
    const result = await query(text, values);
    return result.rows;
  } catch (error) {
    console.error('Error saving stock query:', error);
    throw error;
  }
}

/** Save decision journal row (one stance per emiten per as_of). */
export async function saveDecisionJournal(data: Record<string, unknown>) {
  const serialized = Object.fromEntries(serializeJsonColumns(data));
  const { text, values } = buildUpsert('decision_journal', 'as_of,emiten', serialized);
  try {
    const result = await query(text, values);
    return result.rows;
  } catch (error) {
    console.error('Error saving decision journal:', error);
    throw error;
  }
}

/** Ordered decision journal rows for one emiten, newest first. */
export async function listDecisionJournal(emiten: string, limit = 5) {
  try {
    const result = await query(
      `SELECT * FROM decision_journal
       WHERE emiten = $1
       ORDER BY as_of DESC
       LIMIT $2`,
      [emiten.toUpperCase(), limit]
    );
    return result.rows.map(coerceJournalRow);
  } catch (error) {
    console.error('Error listing decision journal:', error);
    throw error;
  }
}

export const SQL_LIST_DECISION_JOURNAL_BY_DATE = `SELECT * FROM decision_journal
       WHERE as_of = $1
       ORDER BY emiten`;

export const SQL_LIST_LATEST_DECISION_JOURNAL_BY_EMITEN = `SELECT DISTINCT ON (emiten) *
       FROM decision_journal
       ORDER BY emiten, as_of DESC`;

export const SQL_LIST_UNSCORED_ENTER_JOURNAL = `SELECT * FROM decision_journal
       WHERE stance = 'ENTER' AND outcome IS NULL
       ORDER BY as_of ASC, emiten ASC
       LIMIT $1`;

export const SQL_UPDATE_DECISION_JOURNAL_OUTCOME = `UPDATE decision_journal
       SET outcome = $1, r_multiple = $2
       WHERE id = $3 AND outcome IS NULL
       RETURNING *`;

/** Coerce pg DATE / NUMERIC at the journal readers. Never a pool-wide parser. */
export function coerceJournalRow(row: QueryResultRowLike | Record<string, unknown>): Record<string, unknown> {
  const r = row as Record<string, unknown>;
  return {
    ...r,
    emiten: String(r.emiten ?? '').toUpperCase(),
    as_of: ymdOf(r.as_of),
    entry: toFiniteNumber(r.entry),
    r1: toFiniteNumber(r.r1),
    max: toFiniteNumber(r.max),
    invalidation: toFiniteNumber(r.invalidation),
    rr: toFiniteNumber(r.rr),
    r_multiple: toFiniteNumber(r.r_multiple),
    outcome: r.outcome == null || r.outcome === '' ? null : String(r.outcome),
  };
}

/** Daily desk reader: every journal row for one as_of. */
export async function listDecisionJournalByDate(asOf: string) {
  const result = await query(SQL_LIST_DECISION_JOURNAL_BY_DATE, [asOf]);
  return result.rows.map(coerceJournalRow);
}

/** Latest journal row per emiten. */
export async function listLatestDecisionJournalByEmiten() {
  const result = await query(SQL_LIST_LATEST_DECISION_JOURNAL_BY_EMITEN);
  return result.rows.map(coerceJournalRow);
}

/** ENTER rows that have never been scored. */
export async function listUnscoredEnterJournal(limit = 500) {
  const result = await query(SQL_LIST_UNSCORED_ENTER_JOURNAL, [limit]);
  return result.rows.map(coerceJournalRow);
}

/** Idempotent PathExit writer. Does not upsert stance/entry. */
export async function updateDecisionJournalOutcome(
  id: number,
  outcome: PathExit,
  rMultiple: number,
) {
  const result = await query(
    SQL_UPDATE_DECISION_JOURNAL_OUTCOME,
    [outcome, rMultiple, id],
  );
  return result.rows.map(coerceJournalRow);
}

/** Save watchlist analysis — same table/conflict contract as saveStockQuery. */
export async function saveWatchlistAnalysis(data: StockQueryInput) {
  const { text, values } = buildUpsert('stock_queries', 'from_date,emiten', data);
  try {
    const result = await query(text, values);
    return result.rows;
  } catch (error) {
    console.error('Error saving watchlist analysis:', error);
    throw error;
  }
}

// =====================================================================
// Phase 2 — micro persistence (M7 / D3 / D4 / D18 / D20)
// =====================================================================

/**
 * Persist one broker's daily flow row (plan D3, migration 022).
 *
 * D20 is enforced HERE, at the write, not only at the read: a row is written
 * only when `brokerSeenInDetector` is true. A broker that was absent from that
 * session's marketdetectors listing (negotiated-board-only activity, or simply
 * not reported) would otherwise be stored as a legitimate zero-flow row and
 * later read by D9's `net_value < 0` rule as *distribution*.
 *
 * Passing `undefined` for the numeric fields omits them from the statement via
 * buildUpsert, so a partial capture never overwrites a good earlier reading
 * with a null.
 */
export async function saveBrokerFlowDaily(data: {
  emiten: string;
  date: string;
  brokerCode: string;
  netValue?: number | null;
  buyDays?: number | null;
  activeDays?: number | null;
  consistencyPct?: number | null;
  brokerSeenInDetector: boolean;
}) {
  if (!data.brokerSeenInDetector) {
    return []; // D20: never persist a row for a broker that was not observed
  }
  const payload: Record<string, unknown> = {
    emiten: data.emiten.toUpperCase(),
    date: data.date,
    broker_code: data.brokerCode,
    broker_seen_in_detector: true,
    synced_at: new Date().toISOString(),
  };
  if (data.netValue != null) payload.net_value = data.netValue;
  if (data.buyDays != null) payload.buy_days = data.buyDays;
  if (data.activeDays != null) payload.active_days = data.activeDays;
  if (data.consistencyPct != null) payload.consistency_pct = data.consistencyPct;

  const { text, values } = buildUpsert(
    'broker_flow_daily',
    'emiten,date,broker_code',
    payload,
  );
  try {
    const result = await query(text, values);
    return result.rows;
  } catch (error) {
    console.error('Error saving broker flow daily:', error);
    throw error;
  }
}

/** Fetch the flow row for one (emiten, session, broker). Used by replay. */
export async function getFlowRow(
  emiten: string,
  date: string,
  brokerCode: string,
): Promise<BrokerFlowRow | null> {
  const result = await query(
    `SELECT net_value, buy_days, active_days, consistency_pct
     FROM broker_flow_daily
     WHERE emiten = $1 AND date = $2 AND broker_code = $3`,
    [emiten.toUpperCase(), date, brokerCode],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  const netValue = numOrNull(row.net_value);
  const buyDays = numOrNull(row.buy_days);
  const activeDays = numOrNull(row.active_days);
  const consistencyPct = numOrNull(row.consistency_pct);
  if (netValue === null || buyDays === null || activeDays === null || consistencyPct === null) {
    return null; // fail closed on a fabricated numeric (P2-D)
  }
  return { netValue, buyDays, activeDays, consistencyPct };
}

/**
 * The decision-time lookback: up to `n` completed sessions for one broker,
 * `date <= asOf`, oldest first (D5). The window is strictly historical, so a
 * replay sees exactly the rows that existed at decision time.
 */
export async function getFlowWindow(
  emiten: string,
  brokerCode: string,
  asOf: string,
  n: number = 5,
): Promise<BrokerFlowRow[]> {
  const result = await query(
    `SELECT net_value, buy_days, active_days, consistency_pct
     FROM broker_flow_daily
     WHERE emiten = $1 AND broker_code = $2 AND date <= $3
     ORDER BY date DESC
     LIMIT $4`,
    [emiten.toUpperCase(), brokerCode, asOf, n],
  );
  const rows: BrokerFlowRow[] = [];
  for (const raw of result.rows as Array<Record<string, unknown>>) {
    const netValue = numOrNull(raw.net_value);
    const buyDays = numOrNull(raw.buy_days);
    const activeDays = numOrNull(raw.active_days);
    const consistencyPct = numOrNull(raw.consistency_pct);
    if (netValue === null || buyDays === null || activeDays === null || consistencyPct === null) continue;
    rows.push({ netValue, buyDays, activeDays, consistencyPct });
  }
  return rows.reverse(); // oldest first
}

/**
 * Phase 7: Fetch all historical broker flow rows for an emiten up to asOf.
 * Used by the Brosum Insider Radar for multi-window (10d, 20d, 60d) persistence.
 */
export async function getUniverseBrokerFlowHistory(
  emiten: string,
  asOf: string
): Promise<Array<{ date: string; brokerCode: string; netValue: number }>> {
  const result = await query(
    `SELECT date, broker_code, net_value
     FROM broker_flow_daily
     WHERE emiten = $1 AND date <= $2
     ORDER BY date ASC`,
    [emiten.toUpperCase(), asOf]
  );
  return result.rows.map((r: Record<string, unknown>) => ({
    date: String(r.date).slice(0, 10),
    brokerCode: String(r.broker_code ?? ''),
    netValue: Number(r.net_value) || 0,
  }));
}

/** NUMERIC columns arrive from `pg` as strings; a non-finite value becomes null. */
function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** Coerce a NUMERIC column to a finite number, or `null` when it is not one. */
function macroNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(n)) throw new Error(`macro_snapshot column is not numeric: ${String(value)}`);
  return n;
}

/**
 * Phase 4 G7 — read one macro bar as of a signal date.
 *
 * POINT-IN-TIME, AND IT IS NOT OPTIONAL (plan D7). The predicate is
 * `bar_date <= $2`, and the row returned is the NEWEST such bar. IDX trades
 * Mon-Fri minus holidays while USDIDR emits a bar every calendar day, so the
 * series do not share a calendar and an exact-date join would silently drop
 * every weekend FX bar. The as-of join is the only correct way to line a macro
 * leg up with a signal date.
 *
 * The failure this accessor exists to prevent is lookahead: a replay grading a
 * signal dated D with a bar dated after D. That is the single error that
 * silently inflates every backtest, because nothing about it looks wrong in
 * the output — the numbers are all real, they are just from the future.
 *
 * `LIMIT 1` with `ORDER BY bar_date DESC` under that predicate is the whole
 * contract. There is deliberately no `bar_date >= $2` anywhere: that would
 * make the accessor look "complete" while reading the wrong side of the date.
 *
 * Returns `null` when nothing was captured at or before `asOf`, so the
 * classifier can distinguish "no data" from "data with no caution" and fail
 * open to NOT_EVALUATED instead of inventing a neutral reading.
 */
export async function getMacroSnapshot(
  symbol: string,
  asOf: string,
): Promise<{ symbol: string; barDate: string; close: number; volume: number; value: number } | null> {
  const result = await query(
    `SELECT symbol, bar_date, close, volume, value
     FROM macro_snapshot
     WHERE symbol = $1 AND bar_date <= $2
     ORDER BY bar_date DESC
     LIMIT 1`,
    [symbol.toUpperCase(), asOf],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    symbol: String(row.symbol),
    barDate: ymdOf(row.bar_date),
    close: macroNum(row.close),
    volume: macroNum(row.volume),
    value: macroNum(row.value),
  };
}

/**
 * Phase 4 G7 — read the window of macro bars a classifier baseline needs.
 *
 * Returns the `limit` newest bars at or before `asOf`, OLDEST FIRST, so the
 * caller's lookback reads the PRIOR sessions relative to the head. The same
 * `bar_date <= asOf` boundary applies; a baseline built from any bar after the
 * signal date is lookahead, however it is later aggregated.
 *
 * `null` rows are dropped by the query itself, so an unpriceable bar can never
 * enter a baseline as a synthetic zero.
 */
export async function getMacroSnapshotWindow(
  symbol: string,
  asOf: string,
  limit: number,
): Promise<Array<{ symbol: string; barDate: string; close: number }>> {
  const bounded = Math.max(1, Math.trunc(limit));
  const result = await query(
    `SELECT symbol, bar_date, close
     FROM macro_snapshot
     WHERE symbol = $1 AND bar_date <= $2
     ORDER BY bar_date DESC
     LIMIT $3`,
    [symbol.toUpperCase(), asOf, bounded],
  );
  return result.rows
    .map((row) => {
      const r = row as Record<string, unknown>;
      return { symbol: String(r.symbol), barDate: ymdOf(r.bar_date), close: macroNum(r.close) };
    })
    .reverse();
}

/**
 * Phase 3 G5 — persist one emiten's captured KeyStats items.
 *
 * Writes RAW items only, never a verdict (D7): the rubric runs at read time so
 * a threshold or bank-rule fix re-scores history without a backfill. A stored
 * verdict would freeze today's rules into yesterday's data and turn every
 * rubric change into a migration.
 *
 * `value_num` is written as SQL NULL when the vendor gave no number. It is
 * never coerced to 0 — a 0 would make NEGATIVE_EQUITY and EXTREME_LEVERAGE
 * evaluate false and turn absent data into a healthy verdict.
 */
export async function saveKeystatsSnapshot(
  rows: Array<{
    emiten: string;
    asOf: string;
    itemName: string;
    category: string | null;
    valueText: string | null;
    valueNum: number | null;
    scale: string | null;
    currency: string | null;
  }>,
) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // One multi-row INSERT: the snapshot is ~94 items per emiten, and a
  // per-row round trip would spend the shared limiter budget on the database
  // rather than on the vendor call it is protecting.
  const columns = [
    'emiten',
    'as_of',
    'item_name',
    'category',
    'value_text',
    'value_num',
    'scale',
    'currency',
  ];
  const tuples: string[] = [];
  const values: unknown[] = [];
  for (const row of rows) {
    const i = values.length;
    tuples.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8})`);
    const valueNum =
      row.valueNum !== null && Number.isFinite(row.valueNum) ? row.valueNum : null;
    values.push(
      row.emiten.toUpperCase(),
      row.asOf,
      row.itemName,
      row.category,
      row.valueText,
      valueNum,
      row.scale,
      row.currency,
    );
  }

  const text = `INSERT INTO keystats_snapshot (${columns.join(', ')})
     VALUES ${tuples.join(', ')}
     ON CONFLICT (emiten, as_of, item_name) DO UPDATE SET
       category = EXCLUDED.category,
       value_text = EXCLUDED.value_text,
       value_num = EXCLUDED.value_num,
       scale = EXCLUDED.scale,
       currency = EXCLUDED.currency,
       captured_at = NOW()`;

  const result = await query(text, values);
  return result.rows;
}

/**
 * Read the snapshot for one emiten on one capture date (D10).
 *
 * EXACT `as_of` match, no range predicate: the caller has already chosen a
 * point-in-time row via `selectPointInTimeSnapshot`, and a range here would
 * silently blend two capture days into one verdict.
 *
 * Returns `null` when nothing was captured, so the rubric can distinguish
 * "no data" from "data with no landmine".
 */
export async function getKeystatsSnapshot(
  emiten: string,
  asOf: string,
): Promise<ReplayKeystatsSeries | null> {
  // Returned as the same `ReplayKeystatsSeries` the rubric consumes, so a row
  // read here can be scored directly and cannot be quietly reshaped in between.
  // The financial-issuer flag is derived at read time by the same helper the
  // capture path uses — never hard-coded, and never persisted, because a stored
  // flag would go stale the moment an issuer changes sector or a metric is
  // renamed upstream.
  const result = await query(
    `SELECT item_name, category, value_text, value_num, scale
     FROM keystats_snapshot
     WHERE emiten = $1 AND as_of = $2
     ORDER BY item_name`,
    [emiten.toUpperCase(), asOf],
  );
  if (result.rows.length === 0) return null;

  // The row -> entry mapping lives in lib/fundamentals/snapshot-rows.ts so the
  // capture path and this read path cannot drift apart. See that file for why
  // the drift would be dangerous rather than merely untidy.
  return rowsToKeystatsSeries({
    emiten: emiten.toUpperCase(),
    asOf,
    rows: result.rows as unknown as KeystatsSnapshotRow[],
  });
}

/**
 * List the capture dates available for one emiten, newest first. Used to
 * choose a point-in-time row for a historical replay.
 */
export async function getKeystatsSnapshotDates(emiten: string): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT as_of
     FROM keystats_snapshot
     WHERE emiten = $1
     ORDER BY as_of DESC`,
    [emiten.toUpperCase()],
  );
  return result.rows.map((row) => ymdOf((row as Record<string, unknown>).as_of));
}

/**
 * Get watchlist analysis history with optional filters.
 * Preserves the old { data, count } return shape and sort semantics.
 */
export async function getWatchlistAnalysisHistory(filters?: {
  emiten?: string;
  sector?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const sortBy = filters?.sortBy || 'from_date';
  const sortOrder = filters?.sortOrder === 'asc' ? 'asc' : 'desc';

  // Whitelist to avoid SQL injection through the client-controlled sort column.
  const SORTABLE_COLUMNS = new Set([
    'from_date',
    'emiten',
    'sector',
    'harga',
    'target_realistis',
    'target_max',
    'max_harga',
    'status',
    'created_at',
    'updated_at',
    'bandar',
    'real_harga',
  ]);

  const where: string[] = [];
  const params: unknown[] = [];

  if (filters?.emiten) {
    const emitenList = filters.emiten.split(/\s+/).filter(Boolean);
    if (emitenList.length > 0) {
      params.push(emitenList);
      where.push(`emiten = ANY($${params.length}::text[])`);
    }
  }
  if (filters?.sector) {
    params.push(filters.sector);
    where.push(`sector = $${params.length}`);
  }
  if (filters?.fromDate) {
    params.push(filters.fromDate);
    where.push(`from_date >= $${params.length}`);
  }
  if (filters?.toDate) {
    params.push(filters.toDate);
    where.push(`from_date <= $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql: string;
  if (sortBy === 'combined') {
    orderSql = `ORDER BY from_date ${sortOrder}, emiten ${sortOrder}`;
  } else if (sortBy === 'emiten') {
    orderSql = `ORDER BY emiten ${sortOrder}, from_date ASC`;
  } else {
    const column = SORTABLE_COLUMNS.has(sortBy) ? sortBy : 'from_date';
    orderSql = `ORDER BY ${column} ${sortOrder}`;
  }

  let limitSql = '';
  let offsetSql = '';
  if (filters?.limit) {
    params.push(filters.limit);
    limitSql = `LIMIT $${params.length}`;
  }
  if (filters?.offset) {
    params.push(filters.offset);
    offsetSql = `OFFSET $${params.length}`;
  }

  const sql = `
    SELECT *, COUNT(*) OVER() AS full_count
    FROM stock_queries
    ${whereSql}
    ${orderSql}
    ${limitSql}
    ${offsetSql}
  `;

  try {
    const result = await query(sql, params);
    const count = result.rows.length > 0 ? Number((result.rows[0] as Record<string, unknown>).full_count) : 0;
    const rows = result.rows.map(({ full_count: _fullCount, ...row }) => row);
    return { data: rows, count };
  } catch (error) {
    console.error('Error fetching watchlist analysis:', error);
    throw error;
  }
}

export async function getLatestStockQuery(emiten: string) {
  try {
    const result = await query(
      `SELECT * FROM stock_queries
       WHERE emiten = $1 AND status = 'success'
       ORDER BY from_date DESC
       LIMIT 1`,
      [emiten]
    );
    return first(result);
  } catch (error) {
    console.error('Error fetching latest stock query:', error);
    return null;
  }
}

export async function getSpecificStockQuery(emiten: string, fromDate: string, toDate: string) {
  try {
    const result = await query(
      `SELECT * FROM stock_queries
       WHERE emiten = $1 AND from_date = $2 AND to_date = $3 AND status = 'success'
       LIMIT 1`,
      [emiten.toUpperCase(), fromDate, toDate]
    );
    return first(result);
  } catch (error) {
    console.error('Error fetching specific stock query:', error);
    return null;
  }
}

export async function getStockPriceByDate(emiten: string, date: string) {
  try {
    const result = await query(
      `SELECT harga, ara, arb, total_bid, total_offer, fraksi
       FROM stock_queries
       WHERE emiten = $1 AND from_date = $2 AND status = 'success'
       ORDER BY created_at DESC
       LIMIT 1`,
      [emiten.toUpperCase(), date]
    );
    return first(result);
  } catch (error) {
    console.error('Error fetching stock price by date:', error);
    return null;
  }
}

export async function updatePreviousDayRealPrice(
  emiten: string,
  currentDate: string,
  price: number,
  maxPrice?: number
) {
  try {
    const previous = await query(
      `SELECT id, from_date FROM stock_queries
       WHERE emiten = $1 AND status = 'success' AND from_date < $2
       ORDER BY from_date DESC
       LIMIT 1`,
      [emiten, currentDate]
    );
    const record = first(previous);
    if (!record) return null;

    const updateData: Record<string, unknown> = { real_harga: price };
    if (maxPrice !== undefined) updateData.max_harga = maxPrice;

    const setSql = Object.keys(updateData)
      .map((column, index) => `${column} = $${index + 1}`)
      .join(', ');
    const result = await query(
      `UPDATE stock_queries SET ${setSql} WHERE id = $${Object.keys(updateData).length + 1} RETURNING *`,
      [...Object.values(updateData), record.id]
    );
    return result.rows;
  } catch (error) {
    console.error(`Error updating real_harga for ${emiten} on ${currentDate}:`, error);
    return null;
  }
}

// =====================================================================
// Session (key-value store holding the Stockbit token)
// =====================================================================

export interface TokenStatus {
  exists: boolean;
  isValid: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  updatedAt?: string;
  isExpiringSoon: boolean;
  isExpired: boolean;
  hoursUntilExpiry?: number;
}

export async function getSessionValue(key: string): Promise<string | null> {
  try {
    const result = await query(`SELECT value FROM session WHERE key = $1 LIMIT 1`, [key]);
    const row = first(result);
    return row ? String((row as Record<string, unknown>).value) : null;
  } catch (error) {
    console.error('Error fetching session value:', error);
    return null;
  }
}

export async function getTokenStatus(): Promise<TokenStatus> {
  try {
    const result = await query(
      `SELECT value, expires_at, last_used_at, is_valid, updated_at
       FROM session WHERE key = 'stockbit_token' LIMIT 1`
    );
    const data = first(result) as Record<string, unknown> | null;

    if (!data) {
      return { exists: false, isValid: false, isExpiringSoon: false, isExpired: true };
    }

    const now = new Date();
    const expiresAt = data.expires_at ? new Date(String(data.expires_at)) : null;
    const isExpired = expiresAt ? expiresAt < now : false;
    const hoursUntilExpiry = expiresAt
      ? (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)
      : undefined;
    const isExpiringSoon =
      hoursUntilExpiry !== undefined && hoursUntilExpiry <= 1 && hoursUntilExpiry > 0;

    return {
      exists: true,
      isValid: data.is_valid !== false && !isExpired,
      expiresAt: data.expires_at ? String(data.expires_at) : undefined,
      lastUsedAt: data.last_used_at ? String(data.last_used_at) : undefined,
      updatedAt: data.updated_at ? String(data.updated_at) : undefined,
      isExpiringSoon,
      isExpired,
      hoursUntilExpiry,
    };
  } catch (error) {
    console.error('Error fetching token status:', error);
    return { exists: false, isValid: false, isExpiringSoon: false, isExpired: true };
  }
}

export async function upsertSession(key: string, value: string, expiresAt?: Date) {
  const result = await query(
    `INSERT INTO session (key, value, updated_at, expires_at, is_valid, last_used_at)
     VALUES ($1, $2, NOW(), $3, true, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = EXCLUDED.updated_at,
       expires_at = EXCLUDED.expires_at,
       is_valid = EXCLUDED.is_valid,
       last_used_at = EXCLUDED.last_used_at
     RETURNING *`,
    [key, value, expiresAt?.toISOString() ?? null]
  );
  return result.rows;
}

export async function updateTokenLastUsed() {
  try {
    await query(`UPDATE session SET last_used_at = NOW() WHERE key = 'stockbit_token'`);
  } catch (error) {
    console.error('Error updating token last_used_at:', error);
  }
}

export async function invalidateToken() {
  try {
    await query(`UPDATE session SET is_valid = false WHERE key = 'stockbit_token'`);
  } catch (error) {
    console.error('Error invalidating token:', error);
  }
}

export async function setTokenExpiry(hoursFromNow: number = 24) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hoursFromNow);
  try {
    await query(`UPDATE session SET expires_at = $1 WHERE key = 'stockbit_token'`, [
      expiresAt.toISOString(),
    ]);
  } catch (error) {
    console.error('Error setting token expiry:', error);
  }
}

// =====================================================================
// Agent stories
// =====================================================================

export async function createAgentStory(emiten: string) {
  try {
    const result = await query(
      `INSERT INTO agent_stories (emiten, status)
       VALUES ($1, 'pending')
       RETURNING *`,
      [emiten]
    );
    return first(result);
  } catch (error) {
    console.error('Error creating agent story:', error);
    throw error;
  }
}

// node-postgres serializes raw JS arrays as Postgres array literals
// (e.g. {"{...}","{...}"}), which fails against json/jsonb columns with
// "invalid input syntax for type json". Stringify every object/array value
// so the driver sends a JSON literal instead.
const JSON_COLUMNS = new Set([
  'matriks_story',
  'swot_analysis',
  'checklist_katalis',
  'sources',
  'gates',
  'strategi_trading',
]);

/** Serialize json/jsonb column values for the pg driver (see JSON_COLUMNS). */
export function serializeJsonColumns<T extends Record<string, unknown>>(
  data: T
): Array<[keyof T, unknown]> {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([column, value]) => [
      column as keyof T,
      JSON_COLUMNS.has(column) && value !== null && typeof value === 'object'
        ? JSON.stringify(value)
        : value,
    ]);
}

/** Structured trading strategy output produced by the story analysis prompt. */
export interface StrategiTrading {
  tipe_saham: 'swing' | 'fast_trade' | 'investasi';
  catalyst_bias: 'dukung' | 'netral' | 'tolak';
  /** Concrete future events that would invalidate the thesis. */
  invalidating_events: string[];
}

export async function updateAgentStory(
  id: number,
  data: {
    status: 'processing' | 'completed' | 'error';
    matriks_story?: object[];
    swot_analysis?: object;
    checklist_katalis?: object[];
    keystat_signal?: string;
    kesimpulan?: string;
    error_message?: string;
    sources?: { title: string; uri: string }[];
    strategi_trading?: StrategiTrading;
    model?: string | null;
    thinking_level?: string | null;
  }
) {
  const entries = serializeJsonColumns(data);
  const setSql = entries
    .map(([column], index) => `${String(column)} = $${index + 1}`)
    .join(', ');
  const result = await query(
    `UPDATE agent_stories SET ${setSql} WHERE id = $${entries.length + 1} RETURNING *`,
    [...entries.map(([, value]) => value), id]
  );
  return first(result);
}

export async function getAgentStoryByEmiten(emiten: string) {
  try {
    const result = await query(
      `SELECT * FROM agent_stories
       WHERE emiten = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [emiten.toUpperCase()]
    );
    return first(result);
  } catch (error) {
    console.error('Error fetching agent story:', error);
    return null;
  }
}

export async function getAgentStoriesByEmiten(emiten: string, limit: number = 20) {
  try {
    const result = await query(
      `SELECT * FROM agent_stories
       WHERE emiten = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [emiten.toUpperCase(), limit]
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching agent stories:', error);
    throw error;
  }
}

// =====================================================================
// Background job logs
// =====================================================================

export async function createBackgroundJobLog(jobName: string, totalItems: number = 0) {
  try {
    const result = await query(
      `INSERT INTO background_job_logs (job_name, status, total_items, log_entries)
       VALUES ($1, 'running', $2, '[]'::jsonb)
       RETURNING *`,
      [jobName, totalItems]
    );
    return first(result);
  } catch (error) {
    console.error('Error creating background job log:', error);
    throw error;
  }
}

export async function appendBackgroundJobLogEntry(
  jobId: number,
  entry: {
    level: 'info' | 'warn' | 'error';
    message: string;
    emiten?: string;
    details?: Record<string, unknown>;
  }
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  try {
    // JSONB array append via the SQL helper defined in migration 004.
    await query(`SELECT append_job_log_entry($1, $2::jsonb)`, [jobId, JSON.stringify(logEntry)]);
  } catch (error) {
    const err = toError(error);
    // 42883 = undefined_function. The legacy runner fell back to fetch-and-update
    // when the RPC was missing (PGRST202); keep the same graceful fallback.
    if (err.code === '42883') {
      try {
        const current = await query(`SELECT log_entries FROM background_job_logs WHERE id = $1`, [
          jobId,
        ]);
        const row = first(current) as Record<string, unknown> | null;
        const entries = Array.isArray(row?.log_entries) ? row.log_entries : [];
        entries.push(logEntry);
        await query(`UPDATE background_job_logs SET log_entries = $1::jsonb WHERE id = $2`, [
          JSON.stringify(entries),
          jobId,
        ]);
      } catch (fallbackError) {
        console.error('Error appending job log entry (fallback):', fallbackError);
      }
    } else {
      console.error('Error appending job log entry:', error);
    }
  }
}

export async function updateBackgroundJobLog(
  jobId: number,
  data: {
    status: 'completed' | 'failed';
    success_count?: number;
    error_count?: number;
    error_message?: string;
    metadata?: Record<string, unknown>;
  }
) {
  const updateData: Record<string, unknown> = { ...data, completed_at: new Date().toISOString() };
  const setSql = Object.keys(updateData)
    .map((column, index) => `${column} = $${index + 1}`)
    .join(', ');
  const result = await query(
    `UPDATE background_job_logs SET ${setSql} WHERE id = $${Object.keys(updateData).length + 1} RETURNING *`,
    [...Object.values(updateData), jobId]
  );
  return first(result);
}

export async function getBackgroundJobLogs(filters?: {
  jobName?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filters?.jobName) {
    params.push(filters.jobName);
    where.push(`job_name = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    where.push(`status = $${params.length}`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  let limitSql = '';
  let offsetSql = '';
  if (filters?.limit) {
    params.push(filters.limit);
    limitSql = `LIMIT $${params.length}`;
  }
  if (filters?.offset) {
    params.push(filters.offset);
    offsetSql = `OFFSET $${params.length}`;
  }

  const result = await query(
    `SELECT *, COUNT(*) OVER() AS full_count
     FROM background_job_logs
     ${whereSql}
     ORDER BY started_at DESC
     ${limitSql}
     ${offsetSql}`,
    params
  );
  const count = result.rows.length > 0 ? Number((result.rows[0] as Record<string, unknown>).full_count) : 0;
  const rows = result.rows.map(({ full_count: _fullCount, ...row }) => row);
  return { data: rows, count };
}

export async function getLatestBackgroundJobLog(jobName: string) {
  try {
    const result = await query(
      `SELECT * FROM background_job_logs
       WHERE job_name = $1
       ORDER BY started_at DESC
       LIMIT 1`,
      [jobName]
    );
    return first(result);
  } catch (error) {
    console.error('Error fetching latest job log:', error);
    return null;
  }
}

// =====================================================================
// Profile settings
// =====================================================================

export async function getProfileSetting(key: string): Promise<string | null> {
  try {
    const result = await query(`SELECT value FROM profile WHERE key = $1 LIMIT 1`, [key]);
    const row = first(result);
    return row ? String((row as Record<string, unknown>).value) : null;
  } catch (error) {
    console.error('Error fetching profile setting:', error);
    return null;
  }
}

export async function setProfileSetting(key: string, value: string) {
  try {
    const result = await query(
      `INSERT INTO profile (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [key, value]
    );
    return first(result);
  } catch (error) {
    console.error('Error saving profile setting:', error);
    throw error;
  }
}

// =====================================================================
// Price history (daily OHLCV time series)
// =====================================================================

export interface PriceHistoryRow {
  emiten: string;
  date: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  value?: number | null;
  frequency?: number | null;
  foreign_buy?: number | null;
  foreign_sell?: number | null;
  net_foreign?: number | null;
  average?: number | null;
}

/** Upsert one or more daily bars (ON CONFLICT on emiten+date). */
export async function upsertPriceHistory(rows: PriceHistoryRow[]) {
  if (rows.length === 0) return [];
  const columns = [
    'emiten', 'date', 'open', 'high', 'low', 'close', 'volume', 'value',
    'frequency', 'foreign_buy', 'foreign_sell', 'net_foreign', 'average',
  ] as const;
  const values: unknown[] = [];
  const tuples: string[] = rows.map((row, rowIndex) => {
    const placeholders = columns.map((column, columnIndex) => {
      const value = row[column as keyof PriceHistoryRow] ?? null;
      values.push(value);
      return `$${rowIndex * columns.length + columnIndex + 1}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const updateAssignments = columns
    .filter((column) => column !== 'emiten' && column !== 'date')
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(', ');

  const result = await query(
    `INSERT INTO price_history (${columns.join(', ')})
     VALUES ${tuples.join(', ')}
     ON CONFLICT (emiten, date) DO UPDATE SET ${updateAssignments}, synced_at = NOW()
     RETURNING *`,
    values
  );
  return result.rows;
}

/** Ordered daily bars for one emiten between two dates. */
export async function getPriceHistory(emiten: string, from: string, to: string) {
  const result = await query(
    `SELECT * FROM price_history
     WHERE emiten = $1 AND date >= $2 AND date <= $3
     ORDER BY date ASC`,
    [emiten.toUpperCase(), from, to]
  );
  return result.rows;
}

/** Distinct emitens tracked by the analysis pipeline (watchlist history ∪ cache). */
export async function getTrackedEmitens(): Promise<string[]> {
  const result = await query(
    `SELECT DISTINCT emiten FROM stock_queries WHERE emiten IS NOT NULL AND emiten <> ''
     UNION
     SELECT DISTINCT symbol FROM emiten_cache WHERE symbol IS NOT NULL AND symbol <> ''`
  );
  return result.rows.map((row) => String((row as Record<string, unknown>).emiten ?? '').toUpperCase());
}

/** Adi-signal records for the baseline backtest (successful daily analyses). */
export async function getSignalRecords(): Promise<
  Array<{
    emiten: string;
    from_date: string;
    harga: number;
    ara: number | null;
    arb: number | null;
    total_bid: number | null;
    total_offer: number | null;
    bandar: string | null;
    barang_bandar: number | null;
    rata_rata_bandar: number;
    target_realistis: number;
    target_max: number;
    // ---- Phase 2 micro columns (D3). A pre-Phase-2 row has all of these null,
    // which `buildReplayMicro` correctly reads as "not scored" rather than
    // fabricating a neutral verdict. Omitting them here made every replayed
    // signal invisible to system (3) regardless of what the daily job captured.
    accdist_overall: string | null;
    accdist_top1: string | null;
    accdist_top3: string | null;
    accdist_top5: string | null;
    accdist_avg: string | null;
    broker_total_buyer: number | null;
    broker_total_seller: number | null;
    broker_p: number | null;
    capture_incomplete: boolean | null;
    // ---- Phase 3 (D11). Kept SEPARATE from capture_incomplete: the micro and
    // fundamentals captures fail independently, and collapsing them would make
    // one signal's missing fundamental read look like a missing acc/dist read.
    // A pre-Phase-3 row has this null, which replay reads as "not scored"
    // rather than fabricating a neutral verdict.
    fundamentals_incomplete: boolean | null;
    // ---- Phase 4 (D11/D14). Same discipline as the two above: the macro
    // capture fails independently, so its degradation must not be conflated
    // with a missing acc/dist or keystats read. A pre-Phase-4 row has this
    // null, which replay reads as "not scored" rather than a neutral regime.
    macro_incomplete: boolean | null;
    // The emiten's sector, as captured on the signal row. Read-only for the
    // regime classifier's commodity leg; null on pre-Phase-4 rows, which the
    // replay treats as "unknown sector" = unscored rather than "no exposure".
    sector: string | null;
  }>
> {
  const result = await query(
    `SELECT emiten, from_date, harga, ara, arb, total_bid, total_offer,
            bandar, barang_bandar, rata_rata_bandar, target_realistis, target_max,
            accdist_overall, accdist_top1, accdist_top3, accdist_top5, accdist_avg,
            broker_total_buyer, broker_total_seller, broker_p, capture_incomplete,
            fundamentals_incomplete, macro_incomplete, sector
     FROM stock_queries
     WHERE status = 'success'
       AND harga IS NOT NULL
       AND target_realistis IS NOT NULL
     ORDER BY from_date ASC`
  );
  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    const rawDate = ymdOf(r.from_date);
    const toNum = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    return {
      emiten: String(r.emiten),
      from_date: rawDate,
      harga: Number(r.harga),
      ara: toNum(r.ara),
      arb: toNum(r.arb),
      total_bid: toNum(r.total_bid),
      total_offer: toNum(r.total_offer),
      bandar: r.bandar === null || r.bandar === undefined ? null : String(r.bandar).trim(),
      barang_bandar: toNum(r.barang_bandar),
      rata_rata_bandar: Number(r.rata_rata_bandar ?? 0),
      target_realistis: Number(r.target_realistis),
      target_max: Number(r.target_max ?? r.target_realistis),
      accdist_overall: r.accdist_overall === null || r.accdist_overall === undefined ? null : String(r.accdist_overall),
      accdist_top1: r.accdist_top1 === null || r.accdist_top1 === undefined ? null : String(r.accdist_top1),
      accdist_top3: r.accdist_top3 === null || r.accdist_top3 === undefined ? null : String(r.accdist_top3),
      accdist_top5: r.accdist_top5 === null || r.accdist_top5 === undefined ? null : String(r.accdist_top5),
      accdist_avg: r.accdist_avg === null || r.accdist_avg === undefined ? null : String(r.accdist_avg),
      broker_total_buyer: toNum(r.broker_total_buyer),
      broker_total_seller: toNum(r.broker_total_seller),
      broker_p: toNum(r.broker_p),
      capture_incomplete: r.capture_incomplete === true || r.capture_incomplete === 'true',
      fundamentals_incomplete:
        r.fundamentals_incomplete === true || r.fundamentals_incomplete === 'true',
      macro_incomplete: r.macro_incomplete === true || r.macro_incomplete === 'true',
      sector: typeof r.sector === 'string' && r.sector.trim() !== '' ? r.sector.trim() : null,
    };
  });
}

/**
 * Last 3 successful bandar codes for one emiten strictly before `asOf`,
 * oldest first. Replay relies on these for the G1 persistence note and the
 * G4 same-bandar streak.
 */
export async function getPriorBandarCodes(emiten: string, asOf: string): Promise<string[]> {
  const result = await query(
    `SELECT bandar, from_date
     FROM stock_queries
     WHERE emiten = $1
       AND status = 'success'
       AND from_date < $2
       AND bandar IS NOT NULL
       AND bandar <> ''
     ORDER BY from_date DESC
     LIMIT 3`,
    [emiten.toUpperCase(), asOf]
  );
  return result.rows
    .map((row) => String((row as Record<string, unknown>).bandar).trim())
    .filter(Boolean)
    .reverse(); // oldest first
}

// =====================================================================
// Summary statistics
// =====================================================================

export async function getEmitenSummaryStats(limit: number = 5) {
  try {
    const result = await query(
      `SELECT emiten, sector, target_realistis, target_max, max_harga, status, from_date, bandar
       FROM stock_queries
       WHERE status = 'success'
       ORDER BY from_date DESC`
    );

    const emitenGroups: Record<string, Record<string, unknown>[]> = {};
    result.rows.forEach((record) => {
      const row = record as Record<string, unknown>;
      if (!emitenGroups[row.emiten as string]) {
        emitenGroups[row.emiten as string] = [];
      }
      if (emitenGroups[row.emiten as string].length < limit) {
        emitenGroups[row.emiten as string].push(row);
      }
    });

    const stats = Object.entries(emitenGroups).map(([emiten, records]) => {
      const tradingDays = records.length;
      let hitR1Count = 0;
      let hitMaxCount = 0;
      const sector = records[0]?.sector;

      const bandarCounts: Record<string, number> = {};
      records.forEach((r) => {
        const row = r as {
          max_harga?: number | null;
          target_realistis?: number | null;
          target_max?: number | null;
          bandar?: unknown;
        };
        if (hitR1(row)) {
          hitR1Count++;
        }
        if (hitMax(row)) {
          hitMaxCount++;
        }
        if (row.bandar) {
          const bandar = String(row.bandar);
          bandarCounts[bandar] = (bandarCounts[bandar] || 0) + 1;
        }
      });

      const topBandars = Object.entries(bandarCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));

      const hitRateR1 = tradingDays > 0 ? (hitR1Count / tradingDays) * 100 : 0;
      const hitRateMax = tradingDays > 0 ? (hitMaxCount / tradingDays) * 100 : 0;
      const totalHitRate = (hitRateR1 + hitRateMax) / 2;

      return {
        emiten,
        sector,
        tradingDays,
        hitR1: hitR1Count,
        hitMax: hitMaxCount,
        hitRateR1,
        hitRateMax,
        totalHitRate,
        topBandars,
      };
    });

    return stats.sort((a, b) => b.totalHitRate - a.totalHitRate);
  } catch (error) {
    console.error('Error fetching summary stats:', error);
    throw error;
  }
}

// =====================================================================
// Watchlist cache
// =====================================================================

import type { WatchlistGroup } from './types';

export async function hasWatchlistCache(): Promise<boolean> {
  try {
    const result = await query(`SELECT 1 FROM watchlist_groups LIMIT 1`);
    return (result.rowCount ?? 0) > 0;
  } catch (_error) {
    return false;
  }
}

export async function getCachedWatchlistGroups(): Promise<{ groups: WatchlistGroup[]; synced_at: string | null }> {
  try {
    const result = await query(
      `SELECT * FROM watchlist_groups ORDER BY is_default DESC, name ASC`
    );
    const groups: WatchlistGroup[] = result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        watchlist_id: Number(r.watchlist_id),
        name: String(r.name),
        description: r.description ? String(r.description) : '',
        is_default: Boolean(r.is_default),
        is_favorite: Boolean(r.is_favorite),
        emoji: r.emoji ? String(r.emoji) : '',
        category_type: r.category_type ? String(r.category_type) : '',
        total_items: Number(r.total_items || 0),
      };
    });

    const firstRow = result.rows[0] as Record<string, unknown> | undefined;
    return { groups, synced_at: firstRow?.synced_at ? String(firstRow.synced_at) : null };
  } catch (error) {
    console.error('Error fetching cached watchlist groups:', error);
    return { groups: [], synced_at: null };
  }
}

export async function saveCachedWatchlistGroups(groups: WatchlistGroup[]): Promise<void> {
  const now = new Date().toISOString();
  const rows = groups.map((g) => ({
    watchlist_id: g.watchlist_id,
    name: g.name,
    description: g.description || '',
    is_default: g.is_default || false,
    is_favorite: g.is_favorite || false,
    emoji: g.emoji || '',
    category_type: g.category_type || '',
    total_items: g.total_items || 0,
    synced_at: now,
  }));

  try {
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      const values: unknown[] = [];
      const tuples: string[] = rows.map((row, rowIndex) => {
        const placeholders = columns.map((column, columnIndex) => {
          const value = (row as unknown as Record<string, unknown>)[column];
          values.push(value);
          return `$${rowIndex * columns.length + columnIndex + 1}`;
        });
        return `(${placeholders.join(', ')})`;
      });

      const updateAssignments = columns
        .filter((column) => column !== 'watchlist_id')
        .map((column) => `${column} = EXCLUDED.${column}`)
        .join(', ');

      await query(
        `INSERT INTO watchlist_groups (${columns.join(', ')})
         VALUES ${tuples.join(', ')}
         ON CONFLICT (watchlist_id) DO UPDATE SET ${updateAssignments}`,
        values
      );
    }

    // Remove groups that no longer exist in Stockbit.
    const activeIds = groups.map((g) => g.watchlist_id);
    if (activeIds.length > 0) {
      await query(`DELETE FROM watchlist_groups WHERE NOT (watchlist_id = ANY($1::int[]))`, [activeIds]);
    }
  } catch (error) {
    console.error('Error saving cached watchlist groups:', error);
    throw error;
  }
}

export async function getCachedWatchlistItems(
  watchlistId: number
): Promise<{ items: any[]; synced_at: string | null }> {
  try {
    const groupResult = await query(
      `SELECT id, synced_at FROM watchlist_groups WHERE watchlist_id = $1 LIMIT 1`,
      [watchlistId]
    );
    const group = first(groupResult) as Record<string, unknown> | null;
    if (!group) return { items: [], synced_at: null };

    const result = await query(
      `SELECT
         wi.stockbit_item_id,
         wi.company_id,
         wi.symbol,
         ec.name AS company_name,
         ec.sector,
         ec.last_price,
         ec.percent
       FROM watchlist_items wi
       LEFT JOIN emiten_cache ec ON ec.symbol = wi.symbol
       WHERE wi.watchlist_group_id = $1
       ORDER BY wi.symbol ASC`,
      [group.id]
    );

    const items = result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.stockbit_item_id,
        company_id: r.company_id,
        symbol: r.symbol,
        company_code: r.symbol,
        company_name: r.company_name ? String(r.company_name) : '',
        sector: r.sector ?? undefined,
        last_price:
          r.last_price !== null && r.last_price !== undefined ? Number(r.last_price) : 0,
        percent: r.percent ? String(r.percent) : '0',
      };
    });

    return { items, synced_at: group.synced_at ? String(group.synced_at) : null };
  } catch (error) {
    console.error('Error fetching cached watchlist items:', error);
    return { items: [], synced_at: null };
  }
}

export async function saveCachedWatchlistItems(
  watchlistId: number,
  items: Record<string, unknown>[]
): Promise<void> {
  const groupResult = await query(
    `SELECT id FROM watchlist_groups WHERE watchlist_id = $1 LIMIT 1`,
    [watchlistId]
  );
  const group = first(groupResult) as Record<string, unknown> | null;
  if (!group) {
    console.error('Group not found for watchlist_id:', watchlistId);
    return;
  }

  const now = new Date().toISOString();

  if (items.length > 0) {
    // 1. Upsert emiten_cache.
    const symbolsData = items.map((item) => ({
      symbol: String(item.symbol || item.company_code || '').toUpperCase(),
      name: item.company_name ? String(item.company_name) : '',
      sector: item.sector ?? null,
      last_price: item.last_price ?? item.price ?? null,
      percent: item.percent ? String(item.percent) : String(item.change_percentage || '0'),
      synced_at: now,
    }));

    const emitenColumns = ['symbol', 'name', 'sector', 'last_price', 'percent', 'synced_at'];
    const emitenValues: unknown[] = [];
    const emitenTuples = symbolsData.map((row, rowIndex) => {
      const placeholders = emitenColumns.map((column, columnIndex) => {
        const value = (row as unknown as Record<string, unknown>)[column];
        emitenValues.push(value);
        return `$${rowIndex * emitenColumns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    await query(
      `INSERT INTO emiten_cache (${emitenColumns.join(', ')})
       VALUES ${emitenTuples.join(', ')}
       ON CONFLICT (symbol) DO UPDATE SET
         name = EXCLUDED.name,
         sector = EXCLUDED.sector,
         last_price = EXCLUDED.last_price,
         percent = EXCLUDED.percent,
         synced_at = EXCLUDED.synced_at`,
      emitenValues
    );

    // 2. Replace the group's item associations (preserving manually added custom items).
    const watchlistRows = items.map((item) => ({
      watchlist_group_id: group.id,
      stockbit_item_id: String(item.id || ''),
      company_id: item.company_id ?? null,
      symbol: String(item.symbol || item.company_code || '').toUpperCase(),
    }));

    await query(
      `DELETE FROM watchlist_items 
       WHERE watchlist_group_id = $1 
         AND (stockbit_item_id NOT LIKE 'custom_%' OR stockbit_item_id IS NULL)`,
      [group.id]
    );

    const wlColumns = ['watchlist_group_id', 'stockbit_item_id', 'company_id', 'symbol'];
    const wlValues: unknown[] = [];
    const wlTuples = watchlistRows.map((row, rowIndex) => {
      const placeholders = wlColumns.map((column, columnIndex) => {
        const value = (row as unknown as Record<string, unknown>)[column];
        wlValues.push(value);
        return `$${rowIndex * wlColumns.length + columnIndex + 1}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    await query(
      `INSERT INTO watchlist_items (${wlColumns.join(', ')})
       VALUES ${wlTuples.join(', ')}
       ON CONFLICT (watchlist_group_id, symbol) DO UPDATE SET
         stockbit_item_id = EXCLUDED.stockbit_item_id,
         company_id = EXCLUDED.company_id`,
      wlValues
    );
  }

  await query(`UPDATE watchlist_groups SET synced_at = $1 WHERE id = $2`, [now, group.id]);
}

export async function addCachedWatchlistItem(
  watchlistId: number,
  item: {
    symbol: string;
    company_name?: string | null;
    sector?: string | null;
    last_price?: number | null;
    percent?: string | null;
    company_id?: number | null;
    stockbit_item_id?: string | null;
  }
): Promise<{ success: boolean; item?: any; error?: string }> {
  try {
    const groupResult = await query(
      `SELECT id FROM watchlist_groups WHERE watchlist_id = $1 LIMIT 1`,
      [watchlistId]
    );
    const group = first(groupResult) as Record<string, unknown> | null;
    if (!group) {
      return { success: false, error: `Watchlist group ${watchlistId} not found` };
    }

    const symbol = item.symbol.trim().toUpperCase();
    const now = new Date().toISOString();

    // 1. Upsert into emiten_cache
    await query(
      `INSERT INTO emiten_cache (symbol, name, sector, last_price, percent, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (symbol) DO UPDATE SET
         name = CASE WHEN EXCLUDED.name IS NOT NULL AND EXCLUDED.name != '' THEN EXCLUDED.name ELSE emiten_cache.name END,
         sector = COALESCE(EXCLUDED.sector, emiten_cache.sector),
         last_price = COALESCE(EXCLUDED.last_price, emiten_cache.last_price),
         percent = COALESCE(EXCLUDED.percent, emiten_cache.percent),
         synced_at = EXCLUDED.synced_at`,
      [
        symbol,
        item.company_name ?? '',
        item.sector ?? null,
        item.last_price ?? null,
        item.percent ?? '0',
        now,
      ]
    );

    // 2. Insert into watchlist_items (ON CONFLICT DO UPDATE)
    const stockbitItemId = item.stockbit_item_id || `custom_${symbol}`;
    await query(
      `INSERT INTO watchlist_items (watchlist_group_id, stockbit_item_id, company_id, symbol)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (watchlist_group_id, symbol) DO UPDATE SET
         stockbit_item_id = COALESCE(EXCLUDED.stockbit_item_id, watchlist_items.stockbit_item_id),
         company_id = COALESCE(EXCLUDED.company_id, watchlist_items.company_id)`,
      [group.id, stockbitItemId, item.company_id ?? null, symbol]
    );

    return {
      success: true,
      item: {
        id: stockbitItemId,
        company_id: item.company_id ?? null,
        symbol,
        company_code: symbol,
        company_name: item.company_name ?? '',
        sector: item.sector ?? undefined,
        last_price: item.last_price ?? 0,
        percent: item.percent ?? '0',
      },
    };
  } catch (error) {
    console.error('Error adding cached watchlist item:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

export async function deleteCachedWatchlistItem(
  watchlistId: number,
  symbolOrIdentifier: string | { symbol?: string; companyId?: number }
): Promise<void> {
  try {
    const groupResult = await query(
      `SELECT id FROM watchlist_groups WHERE watchlist_id = $1 LIMIT 1`,
      [watchlistId]
    );
    const group = first(groupResult) as Record<string, unknown> | null;
    if (!group) return;

    if (typeof symbolOrIdentifier === 'string') {
      await query(
        `DELETE FROM watchlist_items WHERE watchlist_group_id = $1 AND symbol = $2`,
        [group.id, symbolOrIdentifier.toUpperCase()]
      );
    } else {
      const { symbol, companyId } = symbolOrIdentifier;
      if (symbol && companyId) {
        await query(
          `DELETE FROM watchlist_items WHERE watchlist_group_id = $1 AND (symbol = $2 OR company_id = $3)`,
          [group.id, symbol.toUpperCase(), companyId]
        );
      } else if (symbol) {
        await query(
          `DELETE FROM watchlist_items WHERE watchlist_group_id = $1 AND symbol = $2`,
          [group.id, symbol.toUpperCase()]
        );
      } else if (companyId) {
        await query(
          `DELETE FROM watchlist_items WHERE watchlist_group_id = $1 AND company_id = $2`,
          [group.id, companyId]
        );
      }
    }
  } catch (error) {
    console.error('Error deleting cached watchlist item:', error);
  }
}

// =====================================================================
// Emiten flags (replaces the raw `supabase` client used by two API routes)
// =====================================================================

export async function getEmitenFlag(emiten: string): Promise<string | null> {
  try {
    const result = await query(
      `SELECT flag FROM emiten_flags WHERE emiten = $1 LIMIT 1`,
      [emiten.toUpperCase()]
    );
    const row = first(result);
    return row ? String((row as Record<string, unknown>).flag) : null;
  } catch (error) {
    console.error('Error fetching emiten flag:', error);
    return null;
  }
}

export async function setEmitenFlag(emiten: string, flag: 'OK' | 'NG' | 'Neutral') {
  const result = await query(
    `INSERT INTO emiten_flags (emiten, flag, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (emiten) DO UPDATE SET flag = EXCLUDED.flag, updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [emiten.toUpperCase(), flag]
  );
  return first(result);
}

export async function getEmitenFlagsForSymbols(
  symbols: string[]
): Promise<Record<string, string>[]> {
  if (symbols.length === 0) return [];
  const result = await query(
    `SELECT emiten, flag FROM emiten_flags WHERE emiten = ANY($1::text[])`,
    [symbols]
  );
  return result.rows.map((row) => {
    const r = row as Record<string, unknown>;
    return { emiten: String(r.emiten), flag: String(r.flag) };
  });
}

// =====================================================================
// Institutional Trading Lifecycle (Phase 8 / Migration 028)
// =====================================================================

export interface FlowAbsorptionDbRow {
  emiten: string;
  trade_date: string;
  window_1d_net_val: number;
  window_3d_net_val: number;
  window_5d_net_val: number;
  window_20d_net_val: number;
  top3_concentration_1d: number;
  top3_concentration_5d: number;
  foreign_net_val_5d: number;
  domestic_whale_net_val_5d: number;
  retail_net_val_5d: number;
  price_change_5d_pct: number;
  absorption_quality_score: number;
  absorption_tag: string;
}

export async function getLatestFlowAbsorption(emiten: string): Promise<FlowAbsorptionDbRow | null> {
  try {
    const result = await query(
      `SELECT * FROM flow_absorption_daily
       WHERE emiten = $1
       ORDER BY trade_date DESC
       LIMIT 1`,
      [emiten.toUpperCase()]
    );
    const row = first(result);
    return row ? (row as unknown as FlowAbsorptionDbRow) : null;
  } catch (error) {
    console.error('Error fetching flow absorption:', error);
    return null;
  }
}

export async function saveFlowAbsorption(row: FlowAbsorptionDbRow): Promise<void> {
  await query(
    `INSERT INTO flow_absorption_daily (
      emiten, trade_date, window_1d_net_val, window_3d_net_val, window_5d_net_val, window_20d_net_val,
      top3_concentration_1d, top3_concentration_5d, foreign_net_val_5d, domestic_whale_net_val_5d,
      retail_net_val_5d, price_change_5d_pct, absorption_quality_score, absorption_tag
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (emiten, trade_date) DO UPDATE SET
      window_1d_net_val = EXCLUDED.window_1d_net_val,
      window_3d_net_val = EXCLUDED.window_3d_net_val,
      window_5d_net_val = EXCLUDED.window_5d_net_val,
      window_20d_net_val = EXCLUDED.window_20d_net_val,
      top3_concentration_1d = EXCLUDED.top3_concentration_1d,
      top3_concentration_5d = EXCLUDED.top3_concentration_5d,
      foreign_net_val_5d = EXCLUDED.foreign_net_val_5d,
      domestic_whale_net_val_5d = EXCLUDED.domestic_whale_net_val_5d,
      retail_net_val_5d = EXCLUDED.retail_net_val_5d,
      price_change_5d_pct = EXCLUDED.price_change_5d_pct,
      absorption_quality_score = EXCLUDED.absorption_quality_score,
      absorption_tag = EXCLUDED.absorption_tag`,
    [
      row.emiten.toUpperCase(),
      row.trade_date,
      row.window_1d_net_val,
      row.window_3d_net_val,
      row.window_5d_net_val,
      row.window_20d_net_val,
      row.top3_concentration_1d,
      row.top3_concentration_5d,
      row.foreign_net_val_5d,
      row.domestic_whale_net_val_5d,
      row.retail_net_val_5d,
      row.price_change_5d_pct,
      row.absorption_quality_score,
      row.absorption_tag,
    ]
  );
}

export async function getBattlePlanForDate(planDate: string) {
  try {
    const result = await query(
      `SELECT * FROM premarket_battle_plans
       WHERE plan_date = $1
       ORDER BY emiten ASC`,
      [planDate]
    );
    return result.rows;
  } catch (error) {
    console.error('Error fetching battle plan:', error);
    return [];
  }
}

export async function saveBattlePlan(row: {
  plan_date: string;
  emiten: string;
  stance: string;
  trigger_price: number;
  target_r1: number;
  target_max: number;
  invalidation_price: number;
  open_15m_vol_threshold: number;
  macro_bias?: string;
  catalyst_summary?: string;
}): Promise<void> {
  await query(
    `INSERT INTO premarket_battle_plans (
      plan_date, emiten, stance, trigger_price, target_r1, target_max,
      invalidation_price, open_15m_vol_threshold, macro_bias, catalyst_summary
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (plan_date, emiten) DO UPDATE SET
      stance = EXCLUDED.stance,
      trigger_price = EXCLUDED.trigger_price,
      target_r1 = EXCLUDED.target_r1,
      target_max = EXCLUDED.target_max,
      invalidation_price = EXCLUDED.invalidation_price,
      open_15m_vol_threshold = EXCLUDED.open_15m_vol_threshold,
      macro_bias = EXCLUDED.macro_bias,
      catalyst_summary = EXCLUDED.catalyst_summary`,
    [
      row.plan_date,
      row.emiten.toUpperCase(),
      row.stance,
      row.trigger_price,
      row.target_r1,
      row.target_max,
      row.invalidation_price,
      row.open_15m_vol_threshold,
      row.macro_bias || 'NEUTRAL',
      row.catalyst_summary || null,
    ]
  );
}

export async function saveTapeAlert(row: {
  emiten: string;
  alert_type: string;
  severity: string;
  trigger_price?: number;
  evidence: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO intraday_tape_alerts (emiten, alert_type, severity, trigger_price, evidence)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      row.emiten.toUpperCase(),
      row.alert_type,
      row.severity,
      row.trigger_price || null,
      JSON.stringify(row.evidence),
    ]
  );
}

export async function saveExecutionAudit(row: {
  journal_id?: number | null;
  emiten: string;
  trade_date: string;
  planned_entry: number;
  executed_entry: number;
  slippage_ticks: number;
  slippage_pct: number;
  position_size_lots: number;
  allocated_capital: number;
  actual_exit_price?: number | null;
  realized_pnl?: number | null;
  exit_reason?: string | null;
}) {
  const result = await query(
    `INSERT INTO execution_audits (
      journal_id, emiten, trade_date, planned_entry, executed_entry,
      slippage_ticks, slippage_pct, position_size_lots, allocated_capital,
      actual_exit_price, realized_pnl, exit_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      row.journal_id || null,
      row.emiten.toUpperCase(),
      row.trade_date,
      row.planned_entry,
      row.executed_entry,
      row.slippage_ticks,
      row.slippage_pct,
      row.position_size_lots,
      row.allocated_capital,
      row.actual_exit_price || null,
      row.realized_pnl || null,
      row.exit_reason || null,
    ]
  );
  return first(result);
}

export async function saveBiRateDecision(decision: {
  meeting_date: string;
  rate: number;
  previous_rate: number;
  action: 'HOLD' | 'HIKE' | 'CUT';
  governor_statement?: string;
}): Promise<void> {
  await query(
    `INSERT INTO bi_rate_decisions (meeting_date, rate, previous_rate, action, governor_statement)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (meeting_date) DO UPDATE SET
       rate = EXCLUDED.rate,
       previous_rate = EXCLUDED.previous_rate,
       action = EXCLUDED.action,
       governor_statement = EXCLUDED.governor_statement`,
    [
      decision.meeting_date,
      decision.rate,
      decision.previous_rate,
      decision.action,
      decision.governor_statement || null,
    ]
  );
}

export async function getLatestBiRateDecision(): Promise<{
  meetingDate: string;
  rate: number;
  previousRate: number;
  action: 'HOLD' | 'HIKE' | 'CUT';
  governorStatement?: string | null;
} | null> {
  const result = await query(
    `SELECT * FROM bi_rate_decisions ORDER BY meeting_date DESC LIMIT 1`
  );
  const row = first(result) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    meetingDate: String(row.meeting_date),
    rate: Number(row.rate),
    previousRate: Number(row.previous_rate),
    action: row.action as 'HOLD' | 'HIKE' | 'CUT',
    governorStatement: row.governor_statement ? String(row.governor_statement) : null,
  };
}

export async function saveMacroPressure(pressure: {
  trade_date: string;
  usd_idr_close: number;
  velocity_5d_pct: number;
  velocity_20d_pct: number;
  pressure_score: number;
  regime: string;
}): Promise<void> {
  await query(
    `INSERT INTO macro_pressure_daily (trade_date, usd_idr_close, velocity_5d_pct, velocity_20d_pct, pressure_score, regime)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (trade_date) DO UPDATE SET
       usd_idr_close = EXCLUDED.usd_idr_close,
       velocity_5d_pct = EXCLUDED.velocity_5d_pct,
       velocity_20d_pct = EXCLUDED.velocity_20d_pct,
       pressure_score = EXCLUDED.pressure_score,
       regime = EXCLUDED.regime`,
    [
      pressure.trade_date,
      pressure.usd_idr_close,
      pressure.velocity_5d_pct,
      pressure.velocity_20d_pct,
      pressure.pressure_score,
      pressure.regime,
    ]
  );
}

export async function getLatestMacroPressure(): Promise<{
  tradeDate: string;
  usdIdrClose: number;
  velocity5dPct: number;
  velocity20dPct: number;
  pressureScore: number;
  regime: string;
} | null> {
  const result = await query(
    `SELECT * FROM macro_pressure_daily ORDER BY trade_date DESC LIMIT 1`
  );
  const row = first(result) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    tradeDate: String(row.trade_date),
    usdIdrClose: Number(row.usd_idr_close),
    velocity5dPct: Number(row.velocity_5d_pct),
    velocity20dPct: Number(row.velocity_20d_pct),
    pressureScore: Number(row.pressure_score),
    regime: String(row.regime),
  };
}

export async function saveExecutionTranches(
  auditId: number,
  tranches: Array<{
    tranche_number: number;
    name: string;
    lot_size: number;
    target_session: string;
    executed_price?: number;
    slippage_ticks?: number;
    status?: string;
  }>
): Promise<void> {
  for (const t of tranches) {
    await query(
      `INSERT INTO execution_tranches (audit_id, tranche_number, name, lot_size, target_session, executed_price, slippage_ticks, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        auditId,
        t.tranche_number,
        t.name,
        t.lot_size,
        t.target_session,
        t.executed_price || null,
        t.slippage_ticks || 0,
        t.status || 'PLANNED',
      ]
    );
  }
}

export async function getExecutionTranches(auditId: number): Promise<Array<Record<string, unknown>>> {
  const result = await query(
    `SELECT * FROM execution_tranches WHERE audit_id = $1 ORDER BY tranche_number ASC`,
    [auditId]
  );
  return result.rows as Array<Record<string, unknown>>;
}

export async function saveWyckoffTradingRange(row: {
  emiten: string;
  start_date: string;
  end_date?: string | null;
  ice_support_price: number;
  creek_resistance_price: number;
  range_width_pct: number;
  range_status?: string;
}): Promise<void> {
  await query(
    `INSERT INTO wyckoff_trading_ranges (
       emiten, start_date, end_date, ice_support_price, creek_resistance_price, range_width_pct, range_status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (emiten, start_date) DO UPDATE SET
       end_date = EXCLUDED.end_date,
       ice_support_price = EXCLUDED.ice_support_price,
       creek_resistance_price = EXCLUDED.creek_resistance_price,
       range_width_pct = EXCLUDED.range_width_pct,
       range_status = EXCLUDED.range_status,
       updated_at = NOW()`,
    [
      row.emiten,
      row.start_date,
      row.end_date || null,
      row.ice_support_price,
      row.creek_resistance_price,
      row.range_width_pct,
      row.range_status || 'ACTIVE',
    ]
  );
}

export async function saveWyckoffEvent(row: {
  emiten: string;
  trade_date: string;
  event_type: string;
  price: number;
  relative_volume: number;
  relative_spread: number;
  close_position: number;
  aqs_score?: number | null;
  event_notes?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO wyckoff_structural_events (
       emiten, trade_date, event_type, price, relative_volume, relative_spread, close_position, aqs_score, event_notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (emiten, trade_date, event_type) DO UPDATE SET
       price = EXCLUDED.price,
       relative_volume = EXCLUDED.relative_volume,
       relative_spread = EXCLUDED.relative_spread,
       close_position = EXCLUDED.close_position,
       aqs_score = EXCLUDED.aqs_score,
       event_notes = EXCLUDED.event_notes`,
    [
      row.emiten,
      row.trade_date,
      row.event_type,
      row.price,
      row.relative_volume,
      row.relative_spread,
      row.close_position,
      row.aqs_score ?? null,
      row.event_notes ?? null,
    ]
  );
}

export async function saveWyckoffAssessment(row: {
  emiten: string;
  trade_date: string;
  current_phase: string;
  confidence_score: number;
  ice_level?: number | null;
  creek_level?: number | null;
  last_event?: string | null;
  spring_low?: number | null;
  markup_readiness_score?: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO wyckoff_daily_assessments (
       emiten, trade_date, current_phase, confidence_score, ice_level, creek_level, last_event, spring_low, markup_readiness_score
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (emiten, trade_date) DO UPDATE SET
       current_phase = EXCLUDED.current_phase,
       confidence_score = EXCLUDED.confidence_score,
       ice_level = EXCLUDED.ice_level,
       creek_level = EXCLUDED.creek_level,
       last_event = EXCLUDED.last_event,
       spring_low = EXCLUDED.spring_low,
       markup_readiness_score = EXCLUDED.markup_readiness_score`,
    [
      row.emiten,
      row.trade_date,
      row.current_phase,
      row.confidence_score,
      row.ice_level ?? null,
      row.creek_level ?? null,
      row.last_event ?? null,
      row.spring_low ?? null,
      row.markup_readiness_score ?? null,
    ]
  );
}

export async function getLatestWyckoffAssessment(emiten: string): Promise<Record<string, unknown> | null> {
  const result = await query(
    `SELECT * FROM wyckoff_daily_assessments WHERE emiten = $1 ORDER BY trade_date DESC LIMIT 1`,
    [emiten]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function getWyckoffEventsForEmiten(
  emiten: string,
  limit = 10
): Promise<Array<Record<string, unknown>>> {
  const result = await query(
    `SELECT * FROM wyckoff_structural_events WHERE emiten = $1 ORDER BY trade_date DESC LIMIT $2`,
    [emiten, limit]
  );
  return result.rows as Array<Record<string, unknown>>;
}

export async function saveVolumeProfileSnapshot(row: {
  emiten: string;
  as_of_date: string;
  lookback_days: number;
  poc_price: number;
  vah_price: number;
  val_price: number;
  total_volume: number;
  hvn_shelves?: number[];
  lvn_voids?: number[];
}): Promise<void> {
  await query(
    `INSERT INTO volume_profile_snapshots (
       emiten, as_of_date, lookback_days, poc_price, vah_price, val_price, total_volume, hvn_shelves, lvn_voids
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (emiten, as_of_date, lookback_days) DO UPDATE SET
       poc_price = EXCLUDED.poc_price,
       vah_price = EXCLUDED.vah_price,
       val_price = EXCLUDED.val_price,
       total_volume = EXCLUDED.total_volume,
       hvn_shelves = EXCLUDED.hvn_shelves,
       lvn_voids = EXCLUDED.lvn_voids`,
    [
      row.emiten,
      row.as_of_date,
      row.lookback_days,
      row.poc_price,
      row.vah_price,
      row.val_price,
      row.total_volume,
      JSON.stringify(row.hvn_shelves || []),
      JSON.stringify(row.lvn_voids || []),
    ]
  );
}

export async function getLatestVolumeProfileSnapshot(
  emiten: string,
  lookbackDays = 20
): Promise<Record<string, unknown> | null> {
  const result = await query(
    `SELECT * FROM volume_profile_snapshots 
     WHERE emiten = $1 AND lookback_days = $2 
     ORDER BY as_of_date DESC LIMIT 1`,
    [emiten, lookbackDays]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function saveCognitiveReview(row: {
  emiten: string;
  trade_date: string;
  planned_entry: number;
  realized_entry: number;
  planned_stop: number;
  realized_exit?: number | null;
  planned_lots: number;
  realized_lots: number;
  discipline_score: number;
  grade: string;
  deviations?: Array<Record<string, unknown>>;
  psychological_state?: string;
  trader_reflection?: string;
}): Promise<void> {
  await query(
    `INSERT INTO cognitive_trade_reviews (
       emiten, trade_date, planned_entry, realized_entry, planned_stop, realized_exit,
       planned_lots, realized_lots, discipline_score, grade, deviations, psychological_state, trader_reflection
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      row.emiten,
      row.trade_date,
      row.planned_entry,
      row.realized_entry,
      row.planned_stop,
      row.realized_exit ?? null,
      row.planned_lots,
      row.realized_lots,
      row.discipline_score,
      row.grade,
      JSON.stringify(row.deviations || []),
      row.psychological_state || 'CALM',
      row.trader_reflection ?? null,
    ]
  );
}

export async function getCognitiveReviewsForEmiten(
  emiten: string,
  limit = 10
): Promise<Array<Record<string, unknown>>> {
  const result = await query(
    `SELECT * FROM cognitive_trade_reviews WHERE emiten = $1 ORDER BY trade_date DESC, id DESC LIMIT $2`,
    [emiten, limit]
  );
  return result.rows as Array<Record<string, unknown>>;
}

export async function getTraderPsychologicalCapital(): Promise<Record<string, unknown> | null> {
  const result = await query(
    `SELECT * FROM trader_psychological_capital WHERE id = 1`
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function saveTraderPsychologicalCapital(row: {
  capital_score: number;
  consecutive_violations: number;
  tilt_state: string;
}): Promise<void> {
  await query(
    `INSERT INTO trader_psychological_capital (id, capital_score, consecutive_violations, tilt_state, updated_at)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET
       capital_score = EXCLUDED.capital_score,
       consecutive_violations = EXCLUDED.consecutive_violations,
       tilt_state = EXCLUDED.tilt_state,
       updated_at = NOW()`,
    [row.capital_score, row.consecutive_violations, row.tilt_state]
  );
}

export async function saveSectorRotationSnapshot(row: {
  sector: string;
  trade_date: string;
  rs_ratio: number;
  rs_momentum: number;
  net_flow_5d: number;
  net_flow_20d: number;
  flow_intensity_pct: number;
  quadrant: string;
  constituent_count?: number;
  top_emiten?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO sector_rotation_daily (
       sector, trade_date, rs_ratio, rs_momentum, net_flow_5d, net_flow_20d,
       flow_intensity_pct, quadrant, constituent_count, top_emiten, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (sector, trade_date) DO UPDATE SET
       rs_ratio = EXCLUDED.rs_ratio,
       rs_momentum = EXCLUDED.rs_momentum,
       net_flow_5d = EXCLUDED.net_flow_5d,
       net_flow_20d = EXCLUDED.net_flow_20d,
       flow_intensity_pct = EXCLUDED.flow_intensity_pct,
       quadrant = EXCLUDED.quadrant,
       constituent_count = EXCLUDED.constituent_count,
       top_emiten = EXCLUDED.top_emiten`,
    [
      row.sector,
      row.trade_date,
      row.rs_ratio,
      row.rs_momentum,
      row.net_flow_5d,
      row.net_flow_20d,
      row.flow_intensity_pct,
      row.quadrant,
      row.constituent_count ?? 0,
      row.top_emiten ?? null,
    ]
  );
}

export async function getLatestSectorRotationSnapshots(
  tradeDate?: string
): Promise<Array<Record<string, unknown>>> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM sector_rotation_daily WHERE trade_date = $1 ORDER BY rs_ratio DESC`,
      [tradeDate]
    );
    return result.rows as Array<Record<string, unknown>>;
  }
  const result = await query(
    `SELECT DISTINCT ON (sector) * FROM sector_rotation_daily ORDER BY sector, trade_date DESC`
  );
  return result.rows as Array<Record<string, unknown>>;
}

export async function getSectorRotationForSector(
  sector: string
): Promise<Record<string, unknown> | null> {
  const result = await query(
    `SELECT * FROM sector_rotation_daily WHERE sector = $1 ORDER BY trade_date DESC LIMIT 1`,
    [sector]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function saveVcpPatternSnapshot(row: {
  emiten: string;
  trade_date: string;
  trend_template_passed: boolean;
  sma_50?: number | null;
  sma_150?: number | null;
  sma_200?: number | null;
  pct_from_52w_high?: number | null;
  pct_from_52w_low?: number | null;
  contraction_count?: number;
  contractions?: unknown[];
  pivot_price?: number | null;
  stop_loss_price?: number | null;
  volume_dry_up_ratio?: number | null;
  vcp_stage: string;
  confluence_tag?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO vcp_patterns_daily (
       emiten, trade_date, trend_template_passed, sma_50, sma_150, sma_200,
       pct_from_52w_high, pct_from_52w_low, contraction_count, contractions,
       pivot_price, stop_loss_price, volume_dry_up_ratio, vcp_stage, confluence_tag, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
     ON CONFLICT (emiten, trade_date) DO UPDATE SET
       trend_template_passed = EXCLUDED.trend_template_passed,
       sma_50 = EXCLUDED.sma_50,
       sma_150 = EXCLUDED.sma_150,
       sma_200 = EXCLUDED.sma_200,
       pct_from_52w_high = EXCLUDED.pct_from_52w_high,
       pct_from_52w_low = EXCLUDED.pct_from_52w_low,
       contraction_count = EXCLUDED.contraction_count,
       contractions = EXCLUDED.contractions,
       pivot_price = EXCLUDED.pivot_price,
       stop_loss_price = EXCLUDED.stop_loss_price,
       volume_dry_up_ratio = EXCLUDED.volume_dry_up_ratio,
       vcp_stage = EXCLUDED.vcp_stage,
       confluence_tag = EXCLUDED.confluence_tag`,
    [
      row.emiten,
      row.trade_date,
      row.trend_template_passed,
      row.sma_50 ?? null,
      row.sma_150 ?? null,
      row.sma_200 ?? null,
      row.pct_from_52w_high ?? null,
      row.pct_from_52w_low ?? null,
      row.contraction_count ?? 0,
      JSON.stringify(row.contractions || []),
      row.pivot_price ?? null,
      row.stop_loss_price ?? null,
      row.volume_dry_up_ratio ?? null,
      row.vcp_stage,
      row.confluence_tag ?? null,
    ]
  );
}

export async function getLatestVcpSnapshot(
  emiten: string,
  tradeDate?: string
): Promise<Record<string, unknown> | null> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM vcp_patterns_daily WHERE emiten = $1 AND trade_date = $2 LIMIT 1`,
      [emiten, tradeDate]
    );
    return (result.rows[0] as Record<string, unknown>) || null;
  }
  const result = await query(
    `SELECT * FROM vcp_patterns_daily WHERE emiten = $1 ORDER BY trade_date DESC LIMIT 1`,
    [emiten]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function getLatestVcpUniverse(
  tradeDate?: string
): Promise<Array<Record<string, unknown>>> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM vcp_patterns_daily WHERE trade_date = $1 ORDER BY contraction_count DESC, volume_dry_up_ratio ASC`,
      [tradeDate]
    );
    return result.rows as Array<Record<string, unknown>>;
  }
  const result = await query(
    `SELECT DISTINCT ON (emiten) * FROM vcp_patterns_daily ORDER BY emiten, trade_date DESC`
  );
  return result.rows as Array<Record<string, unknown>>;
}

export async function saveMarketBreadthSnapshot(row: {
  trade_date: string;
  advancers: number;
  decliners: number;
  unchanged: number;
  ad_ratio: number;
  pct_above_ema20: number;
  pct_above_sma50: number;
  pct_above_sma200: number;
  new_highs_52w: number;
  new_lows_52w: number;
  net_foreign_flow: number;
  market_regime: string;
  regime_score: number;
  constituent_count: number;
  advisory?: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO market_breadth_daily (
       trade_date, advancers, decliners, unchanged, ad_ratio,
       pct_above_ema20, pct_above_sma50, pct_above_sma200,
       new_highs_52w, new_lows_52w, net_foreign_flow, market_regime,
       regime_score, constituent_count, advisory, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
     ON CONFLICT (trade_date) DO UPDATE SET
       advancers = EXCLUDED.advancers,
       decliners = EXCLUDED.decliners,
       unchanged = EXCLUDED.unchanged,
       ad_ratio = EXCLUDED.ad_ratio,
       pct_above_ema20 = EXCLUDED.pct_above_ema20,
       pct_above_sma50 = EXCLUDED.pct_above_sma50,
       pct_above_sma200 = EXCLUDED.pct_above_sma200,
       new_highs_52w = EXCLUDED.new_highs_52w,
       new_lows_52w = EXCLUDED.new_lows_52w,
       net_foreign_flow = EXCLUDED.net_foreign_flow,
       market_regime = EXCLUDED.market_regime,
       regime_score = EXCLUDED.regime_score,
       constituent_count = EXCLUDED.constituent_count,
       advisory = EXCLUDED.advisory`,
    [
      row.trade_date,
      row.advancers,
      row.decliners,
      row.unchanged,
      row.ad_ratio,
      row.pct_above_ema20,
      row.pct_above_sma50,
      row.pct_above_sma200,
      row.new_highs_52w,
      row.new_lows_52w,
      row.net_foreign_flow,
      row.market_regime,
      row.regime_score,
      row.constituent_count,
      row.advisory ?? null,
    ]
  );
}

export async function getLatestMarketBreadthSnapshot(
  tradeDate?: string
): Promise<Record<string, unknown> | null> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM market_breadth_daily WHERE trade_date = $1 LIMIT 1`,
      [tradeDate]
    );
    return (result.rows[0] as Record<string, unknown>) || null;
  }
  const result = await query(
    `SELECT * FROM market_breadth_daily ORDER BY trade_date DESC LIMIT 1`
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function getMarketBreadthHistory(
  limit = 30
): Promise<Array<Record<string, unknown>>> {
  const result = await query(
    `SELECT * FROM market_breadth_daily ORDER BY trade_date DESC LIMIT $1`,
    [limit]
  );
  return result.rows as Array<Record<string, unknown>>;
}

export async function saveAnchoredVwapSnapshot(row: {
  emiten: string;
  trade_date: string;
  base_avwap: number;
  base_upper_band_1sd?: number | null;
  base_lower_band_1sd?: number | null;
  base_upper_band_2sd?: number | null;
  base_lower_band_2sd?: number | null;
  volume_climax_avwap?: number | null;
  high_52w_avwap?: number | null;
  bandar_vwap_top3?: number | null;
  bandar_vwap_top5?: number | null;
  confluence_regime: string;
  regime_score?: number;
  advisory?: string | null;
  anchor_metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO anchored_vwap_daily (
       emiten, trade_date, base_avwap, base_upper_band_1sd, base_lower_band_1sd,
       base_upper_band_2sd, base_lower_band_2sd, volume_climax_avwap, high_52w_avwap,
       bandar_vwap_top3, bandar_vwap_top5, confluence_regime, regime_score,
       advisory, anchor_metadata, created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
     ON CONFLICT (emiten, trade_date) DO UPDATE SET
       base_avwap = EXCLUDED.base_avwap,
       base_upper_band_1sd = EXCLUDED.base_upper_band_1sd,
       base_lower_band_1sd = EXCLUDED.base_lower_band_1sd,
       base_upper_band_2sd = EXCLUDED.base_upper_band_2sd,
       base_lower_band_2sd = EXCLUDED.base_lower_band_2sd,
       volume_climax_avwap = EXCLUDED.volume_climax_avwap,
       high_52w_avwap = EXCLUDED.high_52w_avwap,
       bandar_vwap_top3 = EXCLUDED.bandar_vwap_top3,
       bandar_vwap_top5 = EXCLUDED.bandar_vwap_top5,
       confluence_regime = EXCLUDED.confluence_regime,
       regime_score = EXCLUDED.regime_score,
       advisory = EXCLUDED.advisory,
       anchor_metadata = EXCLUDED.anchor_metadata`,
    [
      row.emiten.toUpperCase(),
      row.trade_date,
      row.base_avwap,
      row.base_upper_band_1sd ?? null,
      row.base_lower_band_1sd ?? null,
      row.base_upper_band_2sd ?? null,
      row.base_lower_band_2sd ?? null,
      row.volume_climax_avwap ?? null,
      row.high_52w_avwap ?? null,
      row.bandar_vwap_top3 ?? null,
      row.bandar_vwap_top5 ?? null,
      row.confluence_regime,
      row.regime_score ?? 50,
      row.advisory ?? null,
      JSON.stringify(row.anchor_metadata || {}),
    ]
  );
}

export async function getLatestAnchoredVwap(
  emiten: string,
  tradeDate?: string
): Promise<Record<string, unknown> | null> {
  const symbol = emiten.toUpperCase();
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM anchored_vwap_daily WHERE emiten = $1 AND trade_date = $2 LIMIT 1`,
      [symbol, tradeDate]
    );
    return (result.rows[0] as Record<string, unknown>) || null;
  }
  const result = await query(
    `SELECT * FROM anchored_vwap_daily WHERE emiten = $1 ORDER BY trade_date DESC LIMIT 1`,
    [symbol]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function getLatestAnchoredVwapUniverse(
  tradeDate?: string
): Promise<Array<Record<string, unknown>>> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM anchored_vwap_daily WHERE trade_date = $1 ORDER BY emiten ASC`,
      [tradeDate]
    );
    return result.rows as Array<Record<string, unknown>>;
  }
  const result = await query(
    `SELECT DISTINCT ON (emiten) * FROM anchored_vwap_daily ORDER BY emiten, trade_date DESC`
  );
  return result.rows as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Phase 17: Smart Money Concepts (Order Blocks, FVGs, Liquidity Sweeps)
// ---------------------------------------------------------------------------

export async function saveSmartMoneySnapshot(row: {
  emiten: string;
  trade_date: string;
  market_structure: string;
  last_bos_price?: number | null;
  last_bos_date?: string | null;
  active_bullish_ob?: Record<string, unknown> | null;
  active_bullish_fvg?: Record<string, unknown> | null;
  last_liquidity_sweep?: Record<string, unknown> | null;
  confluence_regime: string;
  regime_score?: number;
  advisory?: string | null;
}): Promise<void> {
  const symbol = row.emiten.toUpperCase();
  await query(
    `INSERT INTO smart_money_structure_daily (
      emiten, trade_date, market_structure, last_bos_price, last_bos_date,
      active_bullish_ob, active_bullish_fvg, last_liquidity_sweep,
      confluence_regime, regime_score, advisory
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (emiten, trade_date) DO UPDATE SET
      market_structure = EXCLUDED.market_structure,
      last_bos_price = EXCLUDED.last_bos_price,
      last_bos_date = EXCLUDED.last_bos_date,
      active_bullish_ob = EXCLUDED.active_bullish_ob,
      active_bullish_fvg = EXCLUDED.active_bullish_fvg,
      last_liquidity_sweep = EXCLUDED.last_liquidity_sweep,
      confluence_regime = EXCLUDED.confluence_regime,
      regime_score = EXCLUDED.regime_score,
      advisory = EXCLUDED.advisory,
      created_at = NOW()`,
    [
      symbol,
      row.trade_date,
      row.market_structure,
      row.last_bos_price ?? null,
      row.last_bos_date ?? null,
      row.active_bullish_ob ? JSON.stringify(row.active_bullish_ob) : null,
      row.active_bullish_fvg ? JSON.stringify(row.active_bullish_fvg) : null,
      row.last_liquidity_sweep ? JSON.stringify(row.last_liquidity_sweep) : null,
      row.confluence_regime,
      row.regime_score ?? 50,
      row.advisory ?? null,
    ]
  );
}

export async function getLatestSmartMoney(
  emiten: string,
  tradeDate?: string
): Promise<Record<string, unknown> | null> {
  const symbol = emiten.toUpperCase();
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM smart_money_structure_daily WHERE emiten = $1 AND trade_date = $2 LIMIT 1`,
      [symbol, tradeDate]
    );
    return (result.rows[0] as Record<string, unknown>) || null;
  }
  const result = await query(
    `SELECT * FROM smart_money_structure_daily WHERE emiten = $1 ORDER BY trade_date DESC LIMIT 1`,
    [symbol]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function getLatestSmartMoneyUniverse(
  tradeDate?: string
): Promise<Array<Record<string, unknown>>> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM smart_money_structure_daily WHERE trade_date = $1 ORDER BY emiten ASC`,
      [tradeDate]
    );
    return result.rows as Array<Record<string, unknown>>;
  }
  const result = await query(
    `SELECT DISTINCT ON (emiten) * FROM smart_money_structure_daily ORDER BY emiten, trade_date DESC`
  );
  return result.rows as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Phase 18: Multi-Timeframe Alignment & Institutional Trend Matrix
// ---------------------------------------------------------------------------

export async function saveMtfSnapshot(row: {
  emiten: string;
  trade_date: string;
  weekly_stage: string;
  weekly_ema10?: number | null;
  weekly_ema30?: number | null;
  weekly_slope_pct?: number | null;
  daily_trend: string;
  daily_ema20?: number | null;
  daily_sma50?: number | null;
  daily_sma200?: number | null;
  alignment_regime: string;
  sizing_multiplier?: number;
  alignment_score?: number;
  advisory?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  const symbol = row.emiten.toUpperCase();
  await query(
    `INSERT INTO multi_timeframe_matrix_daily (
      emiten, trade_date, weekly_stage, weekly_ema10, weekly_ema30, weekly_slope_pct,
      daily_trend, daily_ema20, daily_sma50, daily_sma200,
      alignment_regime, sizing_multiplier, alignment_score, advisory, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    ON CONFLICT (emiten, trade_date) DO UPDATE SET
      weekly_stage = EXCLUDED.weekly_stage,
      weekly_ema10 = EXCLUDED.weekly_ema10,
      weekly_ema30 = EXCLUDED.weekly_ema30,
      weekly_slope_pct = EXCLUDED.weekly_slope_pct,
      daily_trend = EXCLUDED.daily_trend,
      daily_ema20 = EXCLUDED.daily_ema20,
      daily_sma50 = EXCLUDED.daily_sma50,
      daily_sma200 = EXCLUDED.daily_sma200,
      alignment_regime = EXCLUDED.alignment_regime,
      sizing_multiplier = EXCLUDED.sizing_multiplier,
      alignment_score = EXCLUDED.alignment_score,
      advisory = EXCLUDED.advisory,
      metadata = EXCLUDED.metadata,
      created_at = NOW()`,
    [
      symbol,
      row.trade_date,
      row.weekly_stage,
      row.weekly_ema10 ?? null,
      row.weekly_ema30 ?? null,
      row.weekly_slope_pct ?? null,
      row.daily_trend,
      row.daily_ema20 ?? null,
      row.daily_sma50 ?? null,
      row.daily_sma200 ?? null,
      row.alignment_regime,
      row.sizing_multiplier ?? 1.0,
      row.alignment_score ?? 50,
      row.advisory ?? null,
      row.metadata ? JSON.stringify(row.metadata) : null,
    ]
  );
}

export async function getLatestMtf(
  emiten: string,
  tradeDate?: string
): Promise<Record<string, unknown> | null> {
  const symbol = emiten.toUpperCase();
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM multi_timeframe_matrix_daily WHERE emiten = $1 AND trade_date = $2 LIMIT 1`,
      [symbol, tradeDate]
    );
    return (result.rows[0] as Record<string, unknown>) || null;
  }
  const result = await query(
    `SELECT * FROM multi_timeframe_matrix_daily WHERE emiten = $1 ORDER BY trade_date DESC LIMIT 1`,
    [symbol]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function getLatestMtfUniverse(
  tradeDate?: string
): Promise<Array<Record<string, unknown>>> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM multi_timeframe_matrix_daily WHERE trade_date = $1 ORDER BY emiten ASC`,
      [tradeDate]
    );
    return result.rows as Array<Record<string, unknown>>;
  }
  const result = await query(
    `SELECT DISTINCT ON (emiten) * FROM multi_timeframe_matrix_daily ORDER BY emiten, trade_date DESC`
  );
  return result.rows as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Phase 19: Opening Range Breakout (ORB) & Intraday Initial Balance (IB)
// ---------------------------------------------------------------------------

export async function saveOrbSnapshot(row: {
  emiten: string;
  trade_date: string;
  ib15_high: number;
  ib15_low: number;
  ib15_range: number;
  ib15_midpoint: number;
  ib60_high?: number | null;
  ib60_low?: number | null;
  ib60_range?: number | null;
  ib60_midpoint?: number | null;
  extension_r1?: number | null;
  extension_r2?: number | null;
  extension_s1?: number | null;
  extension_s2?: number | null;
  day_type: string;
  confluence_regime: string;
  conviction_score?: number;
  v15m_volume?: number | null;
  advisory?: string | null;
}): Promise<void> {
  const symbol = row.emiten.toUpperCase();
  await query(
    `INSERT INTO opening_range_breakout_daily (
      emiten, trade_date, ib15_high, ib15_low, ib15_range, ib15_midpoint,
      ib60_high, ib60_low, ib60_range, ib60_midpoint,
      extension_r1, extension_r2, extension_s1, extension_s2,
      day_type, confluence_regime, conviction_score, v15m_volume, advisory
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    ON CONFLICT (emiten, trade_date) DO UPDATE SET
      ib15_high = EXCLUDED.ib15_high,
      ib15_low = EXCLUDED.ib15_low,
      ib15_range = EXCLUDED.ib15_range,
      ib15_midpoint = EXCLUDED.ib15_midpoint,
      ib60_high = EXCLUDED.ib60_high,
      ib60_low = EXCLUDED.ib60_low,
      ib60_range = EXCLUDED.ib60_range,
      ib60_midpoint = EXCLUDED.ib60_midpoint,
      extension_r1 = EXCLUDED.extension_r1,
      extension_r2 = EXCLUDED.extension_r2,
      extension_s1 = EXCLUDED.extension_s1,
      extension_s2 = EXCLUDED.extension_s2,
      day_type = EXCLUDED.day_type,
      confluence_regime = EXCLUDED.confluence_regime,
      conviction_score = EXCLUDED.conviction_score,
      v15m_volume = EXCLUDED.v15m_volume,
      advisory = EXCLUDED.advisory,
      created_at = NOW()`,
    [
      symbol,
      row.trade_date,
      row.ib15_high,
      row.ib15_low,
      row.ib15_range,
      row.ib15_midpoint,
      row.ib60_high ?? null,
      row.ib60_low ?? null,
      row.ib60_range ?? null,
      row.ib60_midpoint ?? null,
      row.extension_r1 ?? null,
      row.extension_r2 ?? null,
      row.extension_s1 ?? null,
      row.extension_s2 ?? null,
      row.day_type,
      row.confluence_regime,
      row.conviction_score ?? 50,
      row.v15m_volume ?? null,
      row.advisory ?? null,
    ]
  );
}

export async function getLatestOrb(
  emiten: string,
  tradeDate?: string
): Promise<Record<string, unknown> | null> {
  const symbol = emiten.toUpperCase();
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM opening_range_breakout_daily WHERE emiten = $1 AND trade_date = $2 LIMIT 1`,
      [symbol, tradeDate]
    );
    return (result.rows[0] as Record<string, unknown>) || null;
  }
  const result = await query(
    `SELECT * FROM opening_range_breakout_daily WHERE emiten = $1 ORDER BY trade_date DESC LIMIT 1`,
    [symbol]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function getLatestOrbUniverse(
  tradeDate?: string
): Promise<Array<Record<string, unknown>>> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM opening_range_breakout_daily WHERE trade_date = $1 ORDER BY emiten ASC`,
      [tradeDate]
    );
    return result.rows as Array<Record<string, unknown>>;
  }
  const result = await query(
    `SELECT DISTINCT ON (emiten) * FROM opening_range_breakout_daily ORDER BY emiten, trade_date DESC`
  );
  return result.rows as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Phase 20: Corporate Actions, Ex-Date Dividend Arbitrage & Rights Dilution
// ---------------------------------------------------------------------------

export async function saveCorpActionSnapshot(row: {
  emiten: string;
  trade_date: string;
  action_type: string;
  cum_date?: string | null;
  ex_date?: string | null;
  recording_date?: string | null;
  payment_date?: string | null;
  dividend_amount?: number | null;
  dividend_yield_pct?: number | null;
  ex_date_drop_ratio?: number | null;
  dividend_trap_score?: number | null;
  days_to_cum?: number | null;
  rights_ratio?: string | null;
  rights_exercise_price?: number | null;
  theoretical_price?: number | null;
  dilution_pct?: number | null;
  standby_buyer?: string | null;
  has_standby_buyer?: boolean;
  confluence_regime: string;
  conviction_score?: number;
  advisory?: string | null;
}): Promise<void> {
  const symbol = row.emiten.toUpperCase();
  await query(
    `INSERT INTO corporate_actions_daily (
      emiten, trade_date, action_type, cum_date, ex_date, recording_date, payment_date,
      dividend_amount, dividend_yield_pct, ex_date_drop_ratio, dividend_trap_score, days_to_cum,
      rights_ratio, rights_exercise_price, theoretical_price, dilution_pct,
      standby_buyer, has_standby_buyer, confluence_regime, conviction_score, advisory
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
    ON CONFLICT (emiten, trade_date) DO UPDATE SET
      action_type = EXCLUDED.action_type,
      cum_date = EXCLUDED.cum_date,
      ex_date = EXCLUDED.ex_date,
      recording_date = EXCLUDED.recording_date,
      payment_date = EXCLUDED.payment_date,
      dividend_amount = EXCLUDED.dividend_amount,
      dividend_yield_pct = EXCLUDED.dividend_yield_pct,
      ex_date_drop_ratio = EXCLUDED.ex_date_drop_ratio,
      dividend_trap_score = EXCLUDED.dividend_trap_score,
      days_to_cum = EXCLUDED.days_to_cum,
      rights_ratio = EXCLUDED.rights_ratio,
      rights_exercise_price = EXCLUDED.rights_exercise_price,
      theoretical_price = EXCLUDED.theoretical_price,
      dilution_pct = EXCLUDED.dilution_pct,
      standby_buyer = EXCLUDED.standby_buyer,
      has_standby_buyer = EXCLUDED.has_standby_buyer,
      confluence_regime = EXCLUDED.confluence_regime,
      conviction_score = EXCLUDED.conviction_score,
      advisory = EXCLUDED.advisory,
      created_at = NOW()`,
    [
      symbol,
      row.trade_date,
      row.action_type,
      row.cum_date ?? null,
      row.ex_date ?? null,
      row.recording_date ?? null,
      row.payment_date ?? null,
      row.dividend_amount ?? null,
      row.dividend_yield_pct ?? null,
      row.ex_date_drop_ratio ?? null,
      row.dividend_trap_score ?? 0,
      row.days_to_cum ?? null,
      row.rights_ratio ?? null,
      row.rights_exercise_price ?? null,
      row.theoretical_price ?? null,
      row.dilution_pct ?? null,
      row.standby_buyer ?? null,
      row.has_standby_buyer ?? false,
      row.confluence_regime,
      row.conviction_score ?? 50,
      row.advisory ?? null,
    ]
  );
}

export async function getLatestCorpAction(
  emiten: string,
  tradeDate?: string
): Promise<Record<string, unknown> | null> {
  const symbol = emiten.toUpperCase();
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM corporate_actions_daily WHERE emiten = $1 AND trade_date = $2 LIMIT 1`,
      [symbol, tradeDate]
    );
    return (result.rows[0] as Record<string, unknown>) || null;
  }
  const result = await query(
    `SELECT * FROM corporate_actions_daily WHERE emiten = $1 ORDER BY trade_date DESC LIMIT 1`,
    [symbol]
  );
  return (result.rows[0] as Record<string, unknown>) || null;
}

export async function getLatestCorpActionUniverse(
  tradeDate?: string
): Promise<Array<Record<string, unknown>>> {
  if (tradeDate) {
    const result = await query(
      `SELECT * FROM corporate_actions_daily WHERE trade_date = $1 ORDER BY emiten ASC`,
      [tradeDate]
    );
    return result.rows as Array<Record<string, unknown>>;
  }
  const result = await query(
    `SELECT DISTINCT ON (emiten) * FROM corporate_actions_daily ORDER BY emiten, trade_date DESC`
  );
  return result.rows as Array<Record<string, unknown>>;
}




