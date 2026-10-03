import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 033_sector_rotation_flow.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/033_sector_rotation_flow.sql');
  assert.ok(existsSync(filePath), 'migration file 033_sector_rotation_flow.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS sector_rotation_daily/);
  assert.match(sql, /sector VARCHAR\(50\) NOT NULL/);
  assert.match(sql, /rs_ratio NUMERIC\(8, 2\) NOT NULL/);
  assert.match(sql, /rs_momentum NUMERIC\(8, 2\) NOT NULL/);
  assert.match(sql, /net_flow_5d NUMERIC\(16, 2\) NOT NULL/);
  assert.match(sql, /quadrant VARCHAR\(20\) NOT NULL/);
  assert.match(sql, /uq_sector_rotation/);
  assert.match(sql, /idx_sector_rotation_date/);
});

test('lib/db.ts exports sector rotation persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveSectorRotationSnapshot, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getLatestSectorRotationSnapshots, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getSectorRotationForSector, 'function');
});
