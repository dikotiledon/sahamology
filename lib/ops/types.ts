export type HealthLevel = 'live' | 'ready' | 'ops';

export interface HealthReport {
  ok: boolean;
  level: HealthLevel;
  checks: {
    process: boolean;
    postgres?: boolean;
    redis?: boolean;
    workers?: boolean;
    scheduler?: boolean;
    stall?: boolean;
  };
  reasons: string[];
}

export type JobHealthKind =
  | 'running'
  | 'stalled'
  | 'failed'
  | 'degraded'
  | 'skipped-closed'
  | 'idle';

export type JobCalendar =
  | { kind: 'skip'; reason: 'weekend' | 'holiday'; wall: string }
  | { kind: 'run'; today: string; wall: string };
