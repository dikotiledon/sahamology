import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

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
  token?: string;
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
      token: data.value ? String(data.value) : undefined,
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
  'strategi_trading',
  'sources',
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

export async function updateAgentStory(
  id: number,
  data: {
    status: 'processing' | 'completed' | 'error';
    matriks_story?: object[];
    swot_analysis?: object;
    checklist_katalis?: object[];
    keystat_signal?: string;
    strategi_trading?: object;
    kesimpulan?: string;
    error_message?: string;
    sources?: { title: string; uri: string }[];
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
      let hitR1 = 0;
      let hitMax = 0;
      const sector = records[0]?.sector;

      const bandarCounts: Record<string, number> = {};
      records.forEach((r) => {
        const maxHarga = Number(r.max_harga);
        const targetRealistis = Number(r.target_realistis);
        const targetMax = Number(r.target_max);

        if (Number.isFinite(maxHarga) && Number.isFinite(targetRealistis) && maxHarga >= targetRealistis) {
          hitR1++;
        }
        if (Number.isFinite(maxHarga) && Number.isFinite(targetMax) && maxHarga >= targetMax) {
          hitMax++;
        }
        if (r.bandar) {
          const bandar = String(r.bandar);
          bandarCounts[bandar] = (bandarCounts[bandar] || 0) + 1;
        }
      });

      const topBandars = Object.entries(bandarCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));

      const hitRateR1 = tradingDays > 0 ? (hitR1 / tradingDays) * 100 : 0;
      const hitRateMax = tradingDays > 0 ? (hitMax / tradingDays) * 100 : 0;
      const totalHitRate = (hitRateR1 + hitRateMax) / 2;

      return {
        emiten,
        sector,
        tradingDays,
        hitR1,
        hitMax,
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

    // 2. Replace the group's item associations.
    const watchlistRows = items.map((item) => ({
      watchlist_group_id: group.id,
      stockbit_item_id: String(item.id || ''),
      company_id: item.company_id ?? null,
      symbol: String(item.symbol || item.company_code || '').toUpperCase(),
    }));

    await query(`DELETE FROM watchlist_items WHERE watchlist_group_id = $1`, [group.id]);

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
       VALUES ${wlTuples.join(', ')}`,
      wlValues
    );
  }

  await query(`UPDATE watchlist_groups SET synced_at = $1 WHERE id = $2`, [now, group.id]);
}

export async function deleteCachedWatchlistItem(watchlistId: number, symbol: string): Promise<void> {
  try {
    const groupResult = await query(
      `SELECT id FROM watchlist_groups WHERE watchlist_id = $1 LIMIT 1`,
      [watchlistId]
    );
    const group = first(groupResult) as Record<string, unknown> | null;
    if (!group) return;

    await query(
      `DELETE FROM watchlist_items WHERE watchlist_group_id = $1 AND symbol = $2`,
      [group.id, symbol.toUpperCase()]
    );
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
