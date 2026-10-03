import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 038_multi_timeframe_matrix_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/038_multi_timeframe_matrix_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 038_multi_timeframe_matrix_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS multi_timeframe_matrix_daily/);
  assert.match(sql, /emiten VARCHAR\(10\) NOT NULL/);
  assert.match(sql, /trade_date DATE NOT NULL/);
  assert.match(sql, /weekly_stage VARCHAR\(30\) NOT NULL/);
  assert.match(sql, /weekly_ema10 NUMERIC\(12, 2\)/);
  assert.match(sql, /weekly_ema30 NUMERIC\(12, 2\)/);
  assert.match(sql, /weekly_slope_pct NUMERIC\(6, 2\)/);
  assert.match(sql, /daily_trend VARCHAR\(30\) NOT NULL/);
  assert.match(sql, /daily_ema20 NUMERIC\(12, 2\)/);
  assert.match(sql, /daily_sma50 NUMERIC\(12, 2\)/);
  assert.match(sql, /daily_sma200 NUMERIC\(12, 2\)/);
  assert.match(sql, /alignment_regime VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /sizing_multiplier NUMERIC\(4, 2\) NOT NULL DEFAULT 1\.00/);
  assert.match(sql, /uq_mtf_emiten_date UNIQUE \(emiten, trade_date\)/);
  assert.match(sql, /idx_mtf_date_regime/);
  assert.match(sql, /idx_mtf_emiten_date/);
});

test('lib/db.ts exports multi-timeframe persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveMtfSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestMtf, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestMtfUniverse, 'function');
});
