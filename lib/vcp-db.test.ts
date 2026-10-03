import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 034_vcp_pattern_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/034_vcp_pattern_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 034_vcp_pattern_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vcp_patterns_daily/);
  assert.match(sql, /emiten VARCHAR\(10\) NOT NULL/);
  assert.match(sql, /trade_date DATE NOT NULL/);
  assert.match(sql, /trend_template_passed BOOLEAN/);
  assert.match(sql, /contraction_count INT/);
  assert.match(sql, /contractions JSONB/);
  assert.match(sql, /pivot_price NUMERIC\(12, 2\)/);
  assert.match(sql, /stop_loss_price NUMERIC\(12, 2\)/);
  assert.match(sql, /volume_dry_up_ratio NUMERIC\(6, 2\)/);
  assert.match(sql, /vcp_stage VARCHAR\(30\)/);
  assert.match(sql, /uq_vcp_emiten_date/);
  assert.match(sql, /idx_vcp_date_stage/);
});

test('lib/db.ts exports VCP pattern persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveVcpPatternSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestVcpSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestVcpUniverse, 'function');
});
