import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 039_opening_range_breakout_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/039_opening_range_breakout_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 039_opening_range_breakout_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS opening_range_breakout_daily/);
  assert.match(sql, /emiten VARCHAR\(10\) NOT NULL/);
  assert.match(sql, /trade_date DATE NOT NULL/);
  assert.match(sql, /ib15_high NUMERIC\(12, 2\) NOT NULL/);
  assert.match(sql, /ib15_low NUMERIC\(12, 2\) NOT NULL/);
  assert.match(sql, /ib15_range NUMERIC\(12, 2\) NOT NULL/);
  assert.match(sql, /ib15_midpoint NUMERIC\(12, 2\) NOT NULL/);
  assert.match(sql, /ib60_high NUMERIC\(12, 2\)/);
  assert.match(sql, /ib60_low NUMERIC\(12, 2\)/);
  assert.match(sql, /ib60_range NUMERIC\(12, 2\)/);
  assert.match(sql, /ib60_midpoint NUMERIC\(12, 2\)/);
  assert.match(sql, /extension_r1 NUMERIC\(12, 2\)/);
  assert.match(sql, /extension_r2 NUMERIC\(12, 2\)/);
  assert.match(sql, /extension_s1 NUMERIC\(12, 2\)/);
  assert.match(sql, /extension_s2 NUMERIC\(12, 2\)/);
  assert.match(sql, /day_type VARCHAR\(30\) NOT NULL/);
  assert.match(sql, /confluence_regime VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /conviction_score INTEGER NOT NULL/);
  assert.match(sql, /uq_orb_emiten_date UNIQUE \(emiten, trade_date\)/);
  assert.match(sql, /idx_orb_date_regime/);
  assert.match(sql, /idx_orb_emiten_date/);
});

test('lib/db.ts exports opening range breakout persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveOrbSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestOrb, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestOrbUniverse, 'function');
});
