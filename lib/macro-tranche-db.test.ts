import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 029_macro_tranche_lifecycle.sql contains all required tables and constraints', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/029_macro_tranche_lifecycle.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bi_rate_decisions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS macro_pressure_daily/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS execution_tranches/);
  assert.match(sql, /CHECK \(action IN \('HOLD', 'HIKE', 'CUT'\)\)/);
  assert.match(sql, /CHECK \(regime IN \('MACRO_HEADWIND', 'MACRO_NEUTRAL', 'MACRO_TAILWIND'\)\)/);
  assert.match(sql, /REFERENCES execution_audits\(id\)/);
});
