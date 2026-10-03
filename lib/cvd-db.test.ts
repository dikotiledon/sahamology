import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 041_cumulative_volume_delta_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/041_cumulative_volume_delta_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 041_cumulative_volume_delta_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS cumulative_volume_delta_daily/);
  assert.match(sql, /emiten VARCHAR\(10\) NOT NULL/);
  assert.match(sql, /trade_date DATE NOT NULL/);
  assert.match(sql, /bar_delta NUMERIC\(16, 2\) NOT NULL DEFAULT 0/);
  assert.match(sql, /cvd_20d NUMERIC\(18, 2\) NOT NULL DEFAULT 0/);
  assert.match(sql, /cvd_50d NUMERIC\(18, 2\) NOT NULL DEFAULT 0/);
  assert.match(sql, /delta_ratio_pct NUMERIC\(6, 2\) NOT NULL DEFAULT 0/);
  assert.match(sql, /foreign_buy_value NUMERIC\(18, 2\)/);
  assert.match(sql, /foreign_sell_value NUMERIC\(18, 2\)/);
  assert.match(sql, /foreign_aggression_ratio NUMERIC\(6, 4\)/);
  assert.match(sql, /divergence_type VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /confluence_regime VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /conviction_score INTEGER NOT NULL/);
  assert.match(sql, /uq_cvd_emiten_date UNIQUE \(emiten, trade_date\)/);
  assert.match(sql, /idx_cvd_date_regime/);
  assert.match(sql, /idx_cvd_emiten_date/);
});

test('lib/db.ts exports cumulative volume delta persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveCvdSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestCvd, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestCvdUniverse, 'function');
});
