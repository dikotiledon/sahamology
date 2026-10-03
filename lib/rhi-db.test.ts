import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 042_retail_herd_index_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/042_retail_herd_index_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 042_retail_herd_index_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS retail_herd_index_daily/);
  assert.match(sql, /emiten VARCHAR\(10\) NOT NULL/);
  assert.match(sql, /trade_date DATE NOT NULL/);
  assert.match(sql, /rhi_score NUMERIC\(5, 2\) NOT NULL DEFAULT 50\.00/);
  assert.match(sql, /syndicate_asymmetry_ratio NUMERIC\(6, 2\) NOT NULL DEFAULT 1\.00/);
  assert.match(sql, /retail_net_buy_value NUMERIC\(18, 2\) NOT NULL/);
  assert.match(sql, /retail_participation_ratio NUMERIC\(6, 4\) NOT NULL/);
  assert.match(sql, /top3_net_buy_value NUMERIC\(18, 2\) NOT NULL/);
  assert.match(sql, /top3_concentration_ratio NUMERIC\(6, 4\) NOT NULL/);
  assert.match(sql, /top_retail_buyer VARCHAR\(10\)/);
  assert.match(sql, /top_syndicate_buyer VARCHAR\(10\)/);
  assert.match(sql, /confluence_regime VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /conviction_score INTEGER NOT NULL/);
  assert.match(sql, /uq_rhi_emiten_date UNIQUE \(emiten, trade_date\)/);
  assert.match(sql, /idx_rhi_date_regime/);
  assert.match(sql, /idx_rhi_emiten_date/);
});

test('lib/db.ts exports retail herd index persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveRhiSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestRhi, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestRhiUniverse, 'function');
});
