import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 028_institutional_lifecycle.sql contains all required tables and checks', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/028_institutional_lifecycle.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS broker_archetypes/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS flow_absorption_daily/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS premarket_battle_plans/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS intraday_tape_alerts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS execution_audits/);
  assert.match(sql, /archetype IN \('foreign_institutional', 'domestic_institutional', 'retail', 'proprietary'\)/);
  assert.match(sql, /PRIMARY KEY \(emiten, trade_date\)/);
});
