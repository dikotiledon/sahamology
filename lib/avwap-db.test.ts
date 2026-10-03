import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 036_anchored_vwap_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/036_anchored_vwap_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 036_anchored_vwap_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS anchored_vwap_daily/);
  assert.match(sql, /emiten VARCHAR\(10\) NOT NULL/);
  assert.match(sql, /trade_date DATE NOT NULL/);
  assert.match(sql, /base_avwap NUMERIC\(12, 2\) NOT NULL/);
  assert.match(sql, /base_upper_band_1sd NUMERIC\(12, 2\)/);
  assert.match(sql, /base_lower_band_1sd NUMERIC\(12, 2\)/);
  assert.match(sql, /base_upper_band_2sd NUMERIC\(12, 2\)/);
  assert.match(sql, /base_lower_band_2sd NUMERIC\(12, 2\)/);
  assert.match(sql, /volume_climax_avwap NUMERIC\(12, 2\)/);
  assert.match(sql, /high_52w_avwap NUMERIC\(12, 2\)/);
  assert.match(sql, /bandar_vwap_top3 NUMERIC\(12, 2\)/);
  assert.match(sql, /bandar_vwap_top5 NUMERIC\(12, 2\)/);
  assert.match(sql, /confluence_regime VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /uq_anchored_vwap_emiten_date UNIQUE \(emiten, trade_date\)/);
  assert.match(sql, /idx_avwap_date_regime/);
});

test('lib/db.ts exports anchored vwap persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveAnchoredVwapSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestAnchoredVwap, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestAnchoredVwapUniverse, 'function');
});
