import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BackgroundJobLog } from '@/lib/types';
import {
  CLOCK_SKEW_TOLERANCE_MS,
  JOB_STALL_MS,
  SKIPPED_CLOSED_MAX_AGE_MS,
} from './constants';
import { classifyJobHealth, isJobStalled, lastActivityMs } from './classify';

function job(over: Partial<BackgroundJobLog> & Pick<BackgroundJobLog, 'status'>): BackgroundJobLog {
  return {
    id: 1,
    job_name: 'analyze-watchlist',
    started_at: '2026-09-30T11:00:00.000Z',
    success_count: 0,
    error_count: 0,
    total_items: 0,
    log_entries: [],
    ...over,
  };
}

test('running job with last log older than JOB_STALL_MS is stalled', () => {
  const kind = classifyJobHealth(
    job({
      status: 'running',
      started_at: '2026-09-30T11:00:00.000Z',
      log_entries: [{ timestamp: '2026-09-30T11:00:01.000Z', level: 'info', message: 'x' }],
      error_count: 0,
    }),
    Date.parse('2026-09-30T11:01:30.000Z'),
  );
  assert.equal(kind, 'stalled');
  assert.equal(
    isJobStalled(
      job({
        status: 'running',
        started_at: '2026-09-30T11:00:00.000Z',
        log_entries: [{ timestamp: '2026-09-30T11:00:01.000Z', level: 'info', message: 'x' }],
      }),
      Date.parse('2026-09-30T11:01:30.000Z'),
    ),
    true,
  );
});

test('running job with activity 10s ago is still running', () => {
  const nowMs = Date.parse('2026-09-30T11:00:10.000Z');
  const kind = classifyJobHealth(
    job({
      status: 'running',
      started_at: '2026-09-30T11:00:00.000Z',
    }),
    nowMs,
  );
  assert.equal(kind, 'running');
  assert.equal(isJobStalled(job({ status: 'running', started_at: '2026-09-30T11:00:00.000Z' }), nowMs), false);
});

test('idle bound equal to JOB_STALL_MS is still running', () => {
  const last = Date.parse('2026-09-30T11:00:00.000Z');
  const kind = classifyJobHealth(
    job({ status: 'running', started_at: new Date(last).toISOString() }),
    last + JOB_STALL_MS,
  );
  assert.equal(kind, 'running');
});

test('clock-skew clamp: last nowMs+1 and nowMs+4999 stay running; +5001 stalls', () => {
  const nowMs = Date.parse('2026-09-30T11:00:00.000Z');
  assert.equal(
    classifyJobHealth(job({ status: 'running', started_at: new Date(nowMs + 1).toISOString() }), nowMs),
    'running',
  );
  assert.equal(
    classifyJobHealth(
      job({ status: 'running', started_at: new Date(nowMs + 4_999).toISOString() }),
      nowMs,
    ),
    'running',
  );
  assert.equal(CLOCK_SKEW_TOLERANCE_MS, 5_000);
  assert.equal(
    classifyJobHealth(
      job({ status: 'running', started_at: new Date(nowMs + 5_001).toISOString() }),
      nowMs,
    ),
    'stalled',
  );
  assert.equal(
    classifyJobHealth(
      job({ status: 'running', started_at: new Date(nowMs + 120_000).toISOString() }),
      nowMs,
    ),
    'stalled',
  );
});

test('empty or unparsable timestamps fail-closed stalled', () => {
  const nowMs = Date.parse('2026-09-30T11:00:00.000Z');
  const empty = job({ status: 'running', started_at: '' as unknown as string, log_entries: [] });
  assert.equal(Number.isNaN(lastActivityMs(empty)), true);
  assert.equal(classifyJobHealth(empty, nowMs), 'stalled');
});

test('Date started_at and numeric-epoch heartbeat_at are finite', () => {
  const nowMs = Date.parse('2026-09-30T11:00:00.000Z');
  const withDate = job({
    status: 'running',
    started_at: new Date(nowMs - 1_000) as unknown as string,
  });
  assert.equal(Number.isFinite(lastActivityMs(withDate)), true);
  assert.equal(classifyJobHealth(withDate, nowMs), 'running');
  const withEpoch = job({
    status: 'running',
    started_at: 'not-a-date',
    metadata: { heartbeat_at: nowMs - 500 },
  });
  assert.equal(lastActivityMs(withEpoch), nowMs - 500);
  assert.equal(classifyJobHealth(withEpoch, nowMs), 'running');
});

test('completed with error_count is degraded; holiday skip is skipped-closed; empty-universe is idle', () => {
  assert.equal(classifyJobHealth(job({ status: 'completed', error_count: 2 }), Date.now()), 'degraded');
  assert.equal(
    classifyJobHealth(
      job({
        status: 'completed',
        metadata: { skip_reason: 'holiday' },
        started_at: '2026-09-30T11:00:00.000Z',
      }),
      Date.parse('2026-09-30T12:00:00.000Z'),
    ),
    'skipped-closed',
  );
  assert.equal(
    classifyJobHealth(job({ status: 'completed', error_count: 0 }), Date.now()),
    'idle',
  );
  assert.equal(
    classifyJobHealth(
      job({ status: 'completed', metadata: { skip_reason: 'empty-universe' } }),
      Date.now(),
    ),
    'idle',
  );
  assert.equal(classifyJobHealth(job({ status: 'failed' }), Date.now()), 'failed');
  assert.notEqual(
    classifyJobHealth(
      job({ status: 'completed', metadata: { skip_reason: 7 } }),
      Date.now(),
    ),
    'skipped-closed',
  );
});

test('holiday skip older than 72h is idle; 10h and Friday-to-Monday 10:59 stay skipped-closed', () => {
  const nowMs = Date.parse('2026-09-30T11:00:00.000Z');
  assert.equal(SKIPPED_CLOSED_MAX_AGE_MS, 259_200_000);
  assert.equal(
    classifyJobHealth(
      job({
        status: 'completed',
        metadata: { skip_reason: 'holiday' },
        started_at: new Date(nowMs - 73 * 3_600_000).toISOString(),
      }),
      nowMs,
    ),
    'idle',
  );
  assert.equal(
    classifyJobHealth(
      job({
        status: 'completed',
        metadata: { skip_reason: 'holiday' },
        started_at: new Date(nowMs - 10 * 3_600_000).toISOString(),
      }),
      nowMs,
    ),
    'skipped-closed',
  );
  const friday = Date.parse('2026-12-25T11:00:00.000Z');
  const monday1059 = Date.parse('2026-12-28T10:59:00.000Z');
  assert.equal(
    classifyJobHealth(
      job({
        status: 'completed',
        metadata: { skip_reason: 'holiday' },
        started_at: new Date(friday).toISOString(),
      }),
      monday1059,
    ),
    'skipped-closed',
  );
  const fortyNineHours = nowMs - 49 * 3_600_000;
  assert.equal(
    classifyJobHealth(
      job({
        status: 'completed',
        metadata: { skip_reason: 'holiday' },
        started_at: new Date(fortyNineHours).toISOString(),
      }),
      nowMs,
    ),
    'skipped-closed',
  );
});
