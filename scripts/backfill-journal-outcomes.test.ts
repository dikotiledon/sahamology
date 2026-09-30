import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { backfillJournalOutcomes, type BackfillDeps, type JournalOutcomeRow } from './backfill-journal-outcomes';
import { horizonSessions } from '../lib/playbook/walk-forward';

const asOf = '2026-01-05';
const sessions = horizonSessions(asOf, 5);

const enterRow = (over: Partial<JournalOutcomeRow> = {}): JournalOutcomeRow => ({
  id: 7,
  emiten: 'BBCA',
  as_of: asOf,
  stance: 'ENTER',
  entry: 1000,
  r1: 1050,
  max: 1100,
  invalidation: 970,
  ...over,
});

function completeBars() {
  return sessions.map((date) => ({ date, high: 1060, low: 990, close: 1040 }));
}

test('complete ENTER horizon writes PathExit via outcome IS NULL updater', async () => {
  const updates: Array<{ id: number; outcome: string; rMultiple: number }> = [];
  const deps: BackfillDeps = {
    listUnscored: async () => [enterRow()],
    getBars: async () => completeBars(),
    update: async (id, outcome, rMultiple) => {
      updates.push({ id, outcome, rMultiple });
      return [{ id }];
    },
  };
  const summary = await backfillJournalOutcomes({ limit: 10 }, deps);
  assert.equal(summary.scanned, 1);
  assert.equal(summary.scored, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.id, 7);
  assert.equal(updates[0]?.outcome, 'r1');
  assert.equal(typeof updates[0]?.rMultiple, 'number');
});

test('already scored rows are absent from listUnscored so the updater is not called — idempotent', async () => {
  const updates: unknown[] = [];
  const deps: BackfillDeps = {
    listUnscored: async () => [],
    getBars: async () => completeBars(),
    update: async () => {
      updates.push('called');
      return [];
    },
  };
  const summary = await backfillJournalOutcomes({}, deps);
  assert.equal(summary.scanned, 0);
  assert.equal(summary.scored, 0);
  assert.equal(updates.length, 0);
});

test('incomplete horizon stays unscored and does not call update', async () => {
  const updates: unknown[] = [];
  const deps: BackfillDeps = {
    listUnscored: async () => [enterRow()],
    getBars: async () => [{ date: sessions[0], high: 1060, low: 990, close: 1040 }],
    update: async () => {
      updates.push('called');
      return [];
    },
  };
  const summary = await backfillJournalOutcomes({}, deps);
  assert.equal(summary.scored, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(updates.length, 0);
});

test('dry-run scores in memory but does not write', async () => {
  const updates: unknown[] = [];
  const deps: BackfillDeps = {
    listUnscored: async () => [enterRow()],
    getBars: async () => completeBars(),
    update: async () => {
      updates.push('called');
      return [];
    },
  };
  const summary = await backfillJournalOutcomes({ dryRun: true }, deps);
  assert.equal(summary.scored, 1);
  assert.equal(summary.dryRun, true);
  assert.equal(updates.length, 0);
});

test('source filters date > as_of and requires a complete horizon', () => {
  const src = readFileSync(new URL('./backfill-journal-outcomes.ts', import.meta.url), 'utf8');
  assert.match(src, /isCompleteHorizon/);
  assert.match(src, /date > asOf/);
  assert.match(src, /roundRMultiple/);
  assert.doesNotMatch(src, /outcome\s*[:=]\s*['"]unscored['"]/);
});
