import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 040_corporate_actions_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/040_corporate_actions_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 040_corporate_actions_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS corporate_actions_daily/);
  assert.match(sql, /emiten VARCHAR\(10\) NOT NULL/);
  assert.match(sql, /trade_date DATE NOT NULL/);
  assert.match(sql, /action_type VARCHAR\(30\) NOT NULL/);
  assert.match(sql, /dividend_amount NUMERIC\(12, 2\)/);
  assert.match(sql, /dividend_yield_pct NUMERIC\(6, 2\)/);
  assert.match(sql, /ex_date_drop_ratio NUMERIC\(6, 2\)/);
  assert.match(sql, /dividend_trap_score NUMERIC\(5, 2\)/);
  assert.match(sql, /days_to_cum INT/);
  assert.match(sql, /rights_ratio VARCHAR\(30\)/);
  assert.match(sql, /rights_exercise_price NUMERIC\(12, 2\)/);
  assert.match(sql, /theoretical_price NUMERIC\(12, 2\)/);
  assert.match(sql, /dilution_pct NUMERIC\(6, 2\)/);
  assert.match(sql, /standby_buyer VARCHAR\(100\)/);
  assert.match(sql, /has_standby_buyer BOOLEAN/);
  assert.match(sql, /confluence_regime VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /conviction_score INTEGER NOT NULL/);
  assert.match(sql, /uq_corp_actions_emiten_date UNIQUE \(emiten, trade_date\)/);
  assert.match(sql, /idx_corp_actions_date_regime/);
  assert.match(sql, /idx_corp_actions_emiten_date/);
});

test('lib/db.ts exports corporate actions persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveCorpActionSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestCorpAction, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestCorpActionUniverse, 'function');
});
