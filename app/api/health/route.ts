import { NextResponse } from 'next/server';
import { getBackgroundJobLogs } from '@/lib/db';
import { buildHealthReport } from '@/lib/ops/health';
import { pingPostgres, pingRedis } from '@/lib/ops/ping';
import { getWorkerStatus } from '@/lib/queue';
import type { BackgroundJobLog } from '@/lib/types';
import type { HealthLevel } from '@/lib/ops/types';

export const dynamic = 'force-dynamic';

const LEVELS = new Set<HealthLevel>(['live', 'ready', 'ops']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const level = (searchParams.get('level') ?? 'live') as HealthLevel;
  if (!LEVELS.has(level)) {
    return NextResponse.json(
      { ok: false, level: 'invalid', checks: { process: false }, reasons: ['invalid-level'] },
      { status: 400 },
    );
  }

  const checkedAt = new Date().toISOString();
  try {
    if (level === 'live') {
      return NextResponse.json({ ...buildHealthReport('live', {}), checkedAt });
    }

    const postgres = await pingPostgres();
    const redis = await pingRedis();
    const workers = getWorkerStatus();

    let stalledJobs: BackgroundJobLog[] = [];
    if (level === 'ops') {
      try {
        const logs = await getBackgroundJobLogs({
          jobName: 'analyze-watchlist',
          status: 'running',
          limit: 20,
        });
        stalledJobs = (logs.data ?? []) as unknown as BackgroundJobLog[];
      } catch {
        return NextResponse.json({
          ok: false,
          level,
          checks: {
            process: true,
            postgres,
            redis,
            workers: workers.workersStarted,
            scheduler: workers.schedulerOk,
          },
          reasons: ['postgres-down'],
          checkedAt,
        });
      }
    }

    const report = buildHealthReport(level, {
      postgres,
      redis,
      workers: workers.workersStarted,
      scheduler: workers.schedulerOk,
      stalledJobs,
      nowMs: Date.now(),
    });
    return NextResponse.json({ ...report, checkedAt });
  } catch {
    return NextResponse.json({
      ok: false,
      level,
      checks: { process: true },
      reasons: ['postgres-down'],
      checkedAt,
    });
  }
}
