import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 031_volume_profile_shelves.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/031_volume_profile_shelves.sql');
  assert.ok(existsSync(filePath), 'migration file 031_volume_profile_shelves.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS volume_profile_snapshots/);
  assert.match(sql, /poc_price NUMERIC\(12,\s*2\)/);
  assert.match(sql, /vah_price NUMERIC\(12,\s*2\)/);
  assert.match(sql, /val_price NUMERIC\(12,\s*2\)/);
  assert.match(sql, /hvn_shelves JSONB/);
  assert.match(sql, /lvn_voids JSONB/);
  assert.match(sql, /uq_volume_profile_emiten_date_lookback UNIQUE \(emiten, as_of_date, lookback_days\)/);
  assert.match(sql, /idx_volume_profile_emiten/);
});

test('lib/db.ts exports volume profile persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveVolumeProfileSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestVolumeProfileSnapshot, 'function');
});
