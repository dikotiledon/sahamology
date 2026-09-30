import { CLOCK_SKEW_TOLERANCE_MS, JOB_STALL_MS, SKIPPED_CLOSED_MAX_AGE_MS } from './constants';
import type { BackgroundJobLog } from '@/lib/types';
import type { JobHealthKind } from './types';

export type { JobHealthKind } from './types';

/** pg returns timestamptz as Date (no setTypeParser in lib/db.ts, D19 freeze). JSON rows are strings. */
function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Date.parse(value);
  return Number.NaN;
}

/** metadata is Record<string, unknown> (lib/types.ts:380) — every read must narrow. */
function metaString(job: BackgroundJobLog, key: string): string | undefined {
  const v = job.metadata?.[key];
  return typeof v === 'string' ? v : undefined;
}

export function lastActivityMs(job: BackgroundJobLog): number {
  let max = Number.NaN;
  const consider = (value: unknown) => {
    const ms = toMs(value);
    if (!Number.isFinite(ms)) return;
    max = Number.isFinite(max) ? (ms > max ? ms : max) : ms;
  };
  consider(job.started_at);
  for (const e of job.log_entries ?? []) consider(e.timestamp);
  consider(job.metadata?.heartbeat_at);
  return max;
}

export function classifyJobHealth(job: BackgroundJobLog, nowMs: number): JobHealthKind {
  if (job.status === 'running') {
    let last = lastActivityMs(job);
    if (!Number.isFinite(last)) return 'stalled';
    if (last > nowMs) {
      if (last - nowMs <= CLOCK_SKEW_TOLERANCE_MS) last = nowMs;
      else return 'stalled';
    }
    return nowMs - last > JOB_STALL_MS ? 'stalled' : 'running';
  }
  if (job.status === 'failed') return 'failed';
  const skip = metaString(job, 'skip_reason');
  if (skip === 'holiday' || skip === 'weekend') {
    const last = lastActivityMs(job);
    if (Number.isFinite(last) && nowMs - last > SKIPPED_CLOSED_MAX_AGE_MS) return 'idle';
    return 'skipped-closed';
  }
  if ((job.error_count ?? 0) > 0) return 'degraded';
  return 'idle';
}

export const isJobStalled = (job: BackgroundJobLog, nowMs: number): boolean =>
  classifyJobHealth(job, nowMs) === 'stalled';
