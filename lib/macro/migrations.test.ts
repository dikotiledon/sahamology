import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEPENDED_ON_MIGRATIONS,
  MACRO_INCOMPLETE_DDL,
  MACRO_MIGRATIONS,
  MACRO_SNAPSHOT_DDL,
} from './migrations';

/**
 * Leaf 1.1.2 — the schema contract.
 *
 * `npm test` never reads `supabase/*.sql`, so without this file a schema
 * regression could be committed and CI would stay green until the next deploy
 * hit a live database. The last assertion block below closes that hole: it
 * reads the real SQL files and checks they carry the same key clauses as the
 * constants, so the mirror cannot drift away from the artefact.
 *
 * The three properties worth defending are all inherited from Phase 3, and each
 * has a concrete failure mode behind it:
 *   - ADDITIVE. A migration that rewrites history silently corrupts every
 *     backtest that has already been run.
 *   - NO STORED VERDICT. Storing the classification freezes today's thresholds
 *     into yesterday's data and turns every threshold change into a migration.
 *   - IDEMPOTENT. A partially-applied deploy must be safe to re-run.
 */

/** Strip `--` line comments so a schema assertion cannot match its own prose. */
const executable = (sql: string): string =>
  sql
    .split('\n')
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');

const readSql = (name: string): string => {
  const path = join(process.cwd(), 'supabase', name);
  assert.ok(existsSync(path), `missing migration file: ${name}`);
  return readFileSync(path, 'utf8');
};

describe('macro_snapshot DDL', () => {
  it('keys the table on (symbol, bar_date)', () => {
    assert.match(
      MACRO_SNAPSHOT_DDL,
      /PRIMARY KEY\s*\(\s*symbol\s*,\s*bar_date\s*\)/i,
      'the snapshot grain must be one bar per series per session',
    );
  });

  it('indexes the as-of read path', () => {
    assert.match(
      MACRO_SNAPSHOT_DDL,
      /CREATE INDEX[\s\S]*ON macro_snapshot\s*\(\s*symbol\s*,\s*bar_date\s+DESC\s*\)/i,
      'every regime read is a newest-at-or-before scan',
    );
  });

  it('requires close, so a stored bar can never be empty', () => {
    assert.match(MACRO_SNAPSHOT_DDL, /close\s+NUMERIC\s+NOT NULL/i);
  });

  it('is idempotent', () => {
    assert.match(MACRO_SNAPSHOT_DDL, /CREATE TABLE IF NOT EXISTS/i);
    assert.match(MACRO_SNAPSHOT_DDL, /CREATE INDEX IF NOT EXISTS/i);
  });

  it('carries no stored verdict column', () => {
    const sql = executable(MACRO_SNAPSHOT_DDL);
    assert.doesNotMatch(sql, /verdict|regime|\bstate\b/i);
    assert.doesNotMatch(sql, /JSONB/i);
  });
});

describe('macro_incomplete DDL', () => {
  it('adds exactly the one flag', () => {
    assert.match(
      MACRO_INCOMPLETE_DDL,
      /macro_incomplete\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i,
    );
  });

  it('rewrites no row', () => {
    // An UPDATE here would rewrite historical signals at deploy time.
    assert.doesNotMatch(executable(MACRO_INCOMPLETE_DDL), /\bUPDATE\b/i);
  });
});

describe('both migrations are additive', () => {
  it('contains no destructive statement in the CI-visible constants', () => {
    for (const ddl of [MACRO_SNAPSHOT_DDL, MACRO_INCOMPLETE_DDL]) {
      const sql = executable(ddl);
      assert.doesNotMatch(sql, /\bUPDATE\b/i);
      assert.doesNotMatch(sql, /\bDROP\b/i);
      assert.doesNotMatch(sql, /CREATE\s+OR\s+REPLACE/i);
      assert.doesNotMatch(sql, /\bTRUNCATE\b/i);
    }
  });

  it('numbers the Phase 4 migrations after the Phase 3 set', () => {
    const numbers = MACRO_MIGRATIONS.map((name) => Number(name.slice(0, 3)));
    assert.deepEqual(numbers, [26, 27]);
    const dependedOn = DEPENDED_ON_MIGRATIONS.map((name) => Number(name.slice(0, 3)));
    assert.equal(Math.max(...dependedOn), 25, 'the Phase 3 floor must be migration 025');
    for (const n of numbers) {
      assert.ok(n > 25, `migration ${n} must come after the Phase 3 floor`);
    }
    assert.equal(new Set([...MACRO_MIGRATIONS, ...DEPENDED_ON_MIGRATIONS]).size, 7);
  });
});

describe('the SQL artefacts match the CI-visible constants', () => {
  it('026 declares the same table, key and index', () => {
    const sql = executable(readSql('026_macro_snapshot.sql'));
    assert.match(sql, /CREATE TABLE IF NOT EXISTS macro_snapshot/i);
    assert.match(sql, /PRIMARY KEY\s*\(\s*symbol\s*,\s*bar_date\s*\)/i);
    assert.match(sql, /ON macro_snapshot\s*\(\s*symbol\s*,\s*bar_date\s+DESC\s*\)/i);
  });

  it('027 declares the flag and touches no existing row', () => {
    const sql = executable(readSql('027_stock_queries_macro.sql'));
    assert.match(sql, /macro_incomplete\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
  });

  it('both SQL files are idempotent and non-destructive', () => {
    for (const name of MACRO_MIGRATIONS) {
      const sql = executable(readSql(name));
      assert.match(sql, /IF NOT EXISTS/i, `${name} must be idempotent`);
      assert.doesNotMatch(sql, /CREATE\s+OR\s+REPLACE|DROP\s+TABLE|\bTRUNCATE\b/i);
    }
  });

  it('no SQL file stores a regime verdict', () => {
    for (const name of MACRO_MIGRATIONS) {
      const sql = executable(readSql(name));
      assert.doesNotMatch(sql, /verdict|regime_state/i, `${name} must not store a verdict`);
    }
  });
});
