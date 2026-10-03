import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 035_market_breadth_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/035_market_breadth_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 035_market_breadth_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS market_breadth_daily/);
  assert.match(sql, /trade_date DATE NOT NULL UNIQUE/);
  assert.match(sql, /advancers INT NOT NULL/);
  assert.match(sql, /decliners INT NOT NULL/);
  assert.match(sql, /ad_ratio NUMERIC\(6, 2\)/);
  assert.match(sql, /pct_above_ema20 NUMERIC\(6, 2\)/);
  assert.match(sql, /pct_above_sma50 NUMERIC\(6, 2\)/);
  assert.match(sql, /pct_above_sma200 NUMERIC\(6, 2\)/);
  assert.match(sql, /net_foreign_flow NUMERIC\(16, 2\)/);
  assert.match(sql, /market_regime VARCHAR\(40\)/);
  assert.match(sql, /regime_score INT/);
  assert.match(sql, /idx_breadth_date_regime/);
});

test('lib/db.ts exports market breadth persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveMarketBreadthSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestMarketBreadthSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getMarketBreadthHistory, 'function');
});
