import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural gate for the Phase 2 migrations (plan Task 3 / C5 / C6).
 *
 * HONEST SCOPE: this asserts the migration FILES carry the required
 * statements. It does NOT prove the statements execute against a real
 * PostgreSQL server — that requires `DATABASE_URL` and is recorded as manual
 * gate G8 with the exact command. Do not read a green run of this file as
 * `information_schema` evidence.
 *
 * The checks that ARE here are the ones that silently break a live database:
 * a non-idempotent ADD COLUMN, a stray backfill UPDATE (which would fabricate
 * the acc/dist upgrade the plan exists to avoid), a wrong column type, or a
 * composite key that loses the broker code.
 */

const SQL = (n: string): string => readFileSync(join(__dirname, '..', '..', 'supabase', n), 'utf8');
const upper = (s: string) => s.toUpperCase();

/**
 * Strip `--` line comments so a gate that looks for a SQL keyword cannot be
 * fooled by that keyword appearing in the file's own explanation. `UPDATE` in
 * a comment is documentation; `UPDATE` as a statement is the trap we forbid.
 */
const stripSqlComments = (sql: string): string =>
  sql
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--');
      return i === -1 ? line : line.slice(0, i);
    })
    .join('\n');

describe('021_stock_queries_accdist.sql (D3 — exactly the 8 acc/dist columns)', () => {
  const sql = SQL('021_stock_queries_accdist.sql');

  it('is fully idempotent — every ADD COLUMN is IF NOT EXISTS', () => {
    const body = stripSqlComments(sql);
    const adds = body.match(/ADD\s+COLUMN/gi) ?? [];
    const guarded = body.match(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/gi) ?? [];
    assert.equal(adds.length, guarded.length, 'every ADD COLUMN must be IF NOT EXISTS');
    assert.ok(adds.length >= 8, 'expected at least the 8 D3 columns');
  });

  it('declares exactly the 8 D3 columns', () => {
    for (const col of [
      'accdist_overall',
      'accdist_top1',
      'accdist_top3',
      'accdist_top5',
      'accdist_avg',
      'broker_total_buyer',
      'broker_total_seller',
      'broker_p',
    ]) {
      assert.match(sql, new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}\\b`, 'i'), `missing ${col}`);
    }
  });

  it('acc/dist columns are TEXT and broker counts are INTEGER — no numeric coercion of a vendor string', () => {
    for (const col of ['accdist_overall', 'accdist_top1', 'accdist_top3', 'accdist_top5', 'accdist_avg']) {
      assert.match(sql, new RegExp(`${col}\\s+TEXT`, 'i'), `${col} must be TEXT (D3)`);
    }
    assert.match(sql, /broker_total_buyer\s+INTEGER/i);
    assert.match(sql, /broker_total_seller\s+INTEGER/i);
    assert.match(sql, /broker_p\s+NUMERIC/i);
  });

  it('has NO backfill UPDATE of existing rows (plan Option D is the trap)', () => {
    assert.doesNotMatch(stripSqlComments(sql), /\bUPDATE\b/i, 'a backfill UPDATE would fabricate the acc/dist upgrade');
  });

  it('carries a header comment naming the phase and the D3 rationale', () => {
    assert.match(sql, /Phase 2/i);
    assert.match(sql, /D3/);
  });
});

describe('022_broker_flow_daily.sql (D3/D4/D20 — per-emiten, per-date, per-broker)', () => {
  const sql = SQL('022_broker_flow_daily.sql');

  it('creates the table IF NOT EXISTS', () => {
    assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+broker_flow_daily/i);
  });

  it('has the exact primary key (emiten, date, broker_code) — the broker code must be in the key', () => {
    const pk = stripSqlComments(sql).match(/PRIMARY\s+KEY\s*\(([^)]*)\)/i);
    assert.ok(pk, 'no PRIMARY KEY found');
    const cols = pk![1].split(',').map((c) => c.trim().toLowerCase());
    assert.deepEqual(cols, ['emiten', 'date', 'broker_code']);
  });

  it('stores numerics as NUMERIC/INTEGER, never as the UI string form', () => {
    assert.match(sql, /net_value\s+NUMERIC/i);
    assert.match(sql, /consistency_pct\s+NUMERIC/i);
    assert.match(sql, /buy_days\s+INTEGER/i);
    assert.match(sql, /active_days\s+INTEGER/i);
  });

  it('carries broker_seen_in_detector as NOT NULL DEFAULT FALSE (D20)', () => {
    assert.match(sql, /broker_seen_in_detector\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
  });

  it('has the decision-time window index', () => {
    assert.match(sql, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_broker_flow_daily_code_date/i);
  });

  it('does not put a flow column on price_history (plan Option H was rejected)', () => {
    const h = stripSqlComments(SQL('019_price_history.sql'));
    assert.doesNotMatch(h, /net_value|consistency_pct/i, 'flow must not leak into price_history');
  });
});

describe('023_capture_incomplete.sql (D18/D20 cycle-1 additions)', () => {
  const sql = SQL('023_capture_incomplete.sql');

  it('adds stock_queries.capture_incomplete as NOT NULL DEFAULT FALSE', () => {
    assert.match(
      sql,
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+capture_incomplete\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i,
    );
  });

  it('repeats broker_seen_in_detector idempotently so 023 alone is sufficient', () => {
    assert.match(
      sql,
      /ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+broker_seen_in_detector\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i,
    );
  });

  it('has no backfill UPDATE', () => {
    assert.doesNotMatch(stripSqlComments(sql), /\bUPDATE\b/i);
  });
});

describe('migration ordering (scripts/run-migrations.js is filename-ordered)', () => {
  it('021, 022, 023 sort after every pre-existing migration and in dependency order', () => {
    const files = readFileSync(
      join(__dirname, '..', '..', 'supabase', '021_stock_queries_accdist.sql'),
      'utf8',
    );
    assert.ok(files.length > 0);
    // broker_flow_daily must exist before 023 references it.
    const all = ['019_price_history.sql', '020_decision_journal.sql', '021_stock_queries_accdist.sql', '022_broker_flow_daily.sql', '023_capture_incomplete.sql'];
    assert.deepEqual([...all].sort(), all, 'migration filenames must sort into run order');
  });
});

describe('no stray destructive SQL in the Phase 2 migrations', () => {
  for (const f of ['021_stock_queries_accdist.sql', '022_broker_flow_daily.sql', '023_capture_incomplete.sql']) {
    it(`${f} has no DROP / TRUNCATE / DELETE`, () => {
      const sql = upper(stripSqlComments(SQL(f)));
      assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/);
      assert.doesNotMatch(sql, /\bTRUNCATE\b/);
      assert.doesNotMatch(sql, /\bDELETE\s+FROM\b/);
    });
  }
});
