import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BackgroundJobLog } from '@/lib/types';
import { JOB_STALL_MS } from './constants';
import { buildHealthReport } from './health';

function running(over: Partial<BackgroundJobLog> = {}): BackgroundJobLog {
  return {
    id: 1,
    job_name: 'analyze-watchlist',
    status: 'running',
    started_at: '2026-09-30T11:00:00.000Z',
    success_count: 0,
    error_count: 0,
    total_items: 0,
    log_entries: [],
    ...over,
  };
}

test('live is ok even when redis, postgres, and workers are down', () => {
  const report = buildHealthReport('live', {
    postgres: false,
    redis: false,
    workers: false,
    scheduler: false,
    stalledJobs: [
      running({ started_at: '2026-09-30T10:00:00.000Z' }),
    ],
    nowMs: Date.parse('2026-09-30T11:00:00.000Z'),
  });
  assert.equal(report.ok, true);
  assert.equal(report.level, 'live');
  assert.equal(report.checks.process, true);
  assert.equal(report.checks.postgres, undefined);
  assert.equal(report.checks.redis, undefined);
  assert.equal(report.reasons.length, 0);
});

test('ready fails when workersStarted is false', () => {
  const report = buildHealthReport('ready', {
    postgres: true,
    redis: true,
    workers: false,
    scheduler: true,
  });
  assert.equal(report.ok, false);
  assert.equal(report.checks.workers, false);
  assert.ok(report.reasons.includes('workers-down'));
});

test('ops fails when a running watchlist job is stalled', () => {
  const nowMs = Date.parse('2026-09-30T11:02:00.000Z');
  const report = buildHealthReport('ops', {
    postgres: true,
    redis: true,
    workers: true,
    scheduler: true,
    stalledJobs: [
      running({
        started_at: new Date(nowMs - JOB_STALL_MS - 1).toISOString(),
      }),
    ],
    nowMs,
  });
  assert.equal(report.ok, false);
  assert.equal(report.checks.stall, false);
  assert.ok(report.reasons.includes('job-stalled'));
});

test('ops fails when the scheduler is missing even with no stall', () => {
  const report = buildHealthReport('ops', {
    postgres: true,
    redis: true,
    workers: true,
    scheduler: false,
    stalledJobs: [],
  });
  assert.equal(report.ok, false);
  assert.ok(report.reasons.includes('scheduler-missing'));
});

test('live never becomes ok:false from a stall', () => {
  const report = buildHealthReport('live', {
    stalledJobs: [running({ started_at: '1970-01-01T00:00:00.000Z' })],
    nowMs: Date.now(),
  });
  assert.equal(report.ok, true);
  assert.equal(report.reasons.includes('job-stalled'), false);
});
