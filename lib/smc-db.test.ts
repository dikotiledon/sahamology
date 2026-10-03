import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 037_smart_money_structure_daily.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/037_smart_money_structure_daily.sql');
  assert.ok(existsSync(filePath), 'migration file 037_smart_money_structure_daily.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS smart_money_structure_daily/);
  assert.match(sql, /emiten VARCHAR\(10\) NOT NULL/);
  assert.match(sql, /trade_date DATE NOT NULL/);
  assert.match(sql, /market_structure VARCHAR\(30\) NOT NULL/);
  assert.match(sql, /last_bos_price NUMERIC\(12, 2\)/);
  assert.match(sql, /last_bos_date DATE/);
  assert.match(sql, /active_bullish_ob JSONB/);
  assert.match(sql, /active_bullish_fvg JSONB/);
  assert.match(sql, /last_liquidity_sweep JSONB/);
  assert.match(sql, /confluence_regime VARCHAR\(40\) NOT NULL/);
  assert.match(sql, /uq_smart_money_emiten_date UNIQUE \(emiten, trade_date\)/);
  assert.match(sql, /idx_smc_date_regime/);
  assert.match(sql, /idx_smc_emiten_date/);
});

test('lib/db.ts exports smart money persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveSmartMoneySnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestSmartMoney, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestSmartMoneyUniverse, 'function');
});
