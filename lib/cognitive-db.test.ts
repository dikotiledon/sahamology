import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('migration 032_cognitive_journal.sql exists and contains expected tables and constraints', () => {
  const filePath = resolve(process.cwd(), 'supabase/032_cognitive_journal.sql');
  assert.ok(existsSync(filePath), 'migration file 032_cognitive_journal.sql must exist');

  const sql = readFileSync(filePath, 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS cognitive_trade_reviews/);
  assert.match(sql, /discipline_score INT NOT NULL/);
  assert.match(sql, /deviations JSONB/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS trader_psychological_capital/);
  assert.match(sql, /tilt_state VARCHAR\(20\)/);
  assert.match(sql, /idx_cognitive_reviews_emiten/);
});

test('lib/db.ts exports cognitive journal persistence helpers', async () => {
  const db = await import('./db');
  assert.equal(typeof (db as Record<string, unknown>).saveCognitiveReview, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getCognitiveReviewsForEmiten, 'function');
  assert.equal(typeof (db as Record<string, unknown>).getTraderPsychologicalCapital, 'function');
  assert.equal(typeof (db as Record<string, unknown>).saveTraderPsychologicalCapital, 'function');
});
