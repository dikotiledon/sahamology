import type { BackgroundJobLog } from '@/lib/types';
import { isJobStalled } from './classify';
import { HEALTH_REASONS } from './constants';
import type { HealthLevel, HealthReport } from './types';

export type { HealthLevel, HealthReport } from './types';
export { HEALTH_REASONS };

export interface HealthDeps {
  postgres?: boolean;
  redis?: boolean;
  workers?: boolean;
  scheduler?: boolean;
  stalledJobs?: readonly BackgroundJobLog[];
  nowMs?: number;
}

export function buildHealthReport(level: HealthLevel, deps: HealthDeps = {}): HealthReport {
  if (level === 'live') {
    return { ok: true, level, checks: { process: true }, reasons: [] };
  }

  const reasons: string[] = [];
  const postgres = deps.postgres === true;
  const redis = deps.redis === true;
  const workers = deps.workers === true;
  if (!postgres) reasons.push('postgres-down');
  if (!redis) reasons.push('redis-down');
  if (!workers) reasons.push('workers-down');

  const checks: HealthReport['checks'] = { process: true, postgres, redis, workers };
  if (level === 'ready') {
    return { ok: postgres && redis && workers, level, checks, reasons };
  }

  const scheduler = deps.scheduler === true;
  const nowMs = deps.nowMs ?? Date.now();
  const stalled = (deps.stalledJobs ?? []).some((job) => isJobStalled(job, nowMs));
  if (!scheduler) reasons.push('scheduler-missing');
  if (stalled) reasons.push('job-stalled');
  return {
    ok: postgres && redis && workers && scheduler && !stalled,
    level,
    checks: { ...checks, scheduler, stall: !stalled },
    reasons,
  };
}

export type HealthReason = (typeof HEALTH_REASONS)[number];
