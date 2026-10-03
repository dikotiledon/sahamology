import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 030_wyckoff_structure.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/030_wyckoff_structure.sql');
  assert.ok(existsSync(filePath), 'migration file 030_wyckoff_structure.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS wyckoff_trading_ranges/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS wyckoff_structural_events/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS wyckoff_daily_assessments/);
  assert.match(sql, /ice_support_price/);
  assert.match(sql, /creek_resistance_price/);
  assert.match(
    sql,
    /CHECK \(event_type IN \('SELLING_CLIMAX', 'AUTOMATIC_RALLY', 'SECONDARY_TEST', 'SPRING', 'SIGN_OF_STRENGTH', 'LAST_POINT_OF_SUPPORT', 'UPTHRUST', 'UTAD'\)\)/
  );
  assert.match(
    sql,
    /CHECK \(current_phase IN \('PHASE_A_STOPPING', 'PHASE_B_ABSORPTION', 'PHASE_C_SPRING', 'PHASE_D_TRANSITION', 'PHASE_E_MARKUP', 'PHASE_DISTRIBUTION', 'WYCKOFF_UNCLASSIFIED'\)\)/
  );
  assert.match(sql, /idx_wyckoff_daily_phase/);
});

test('lib/db.ts exports Wyckoff helper functions', async () => {
  const db = await import('./db');
  assert.equal(typeof db.saveWyckoffTradingRange, 'function');
  assert.equal(typeof db.saveWyckoffEvent, 'function');
  assert.equal(typeof db.saveWyckoffAssessment, 'function');
  assert.equal(typeof db.getLatestWyckoffAssessment, 'function');
  assert.equal(typeof db.getWyckoffEventsForEmiten, 'function');
});
