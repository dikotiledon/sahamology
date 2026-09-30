export const STOCKBIT_TIMEOUT_MS = 15_000;
export const JOB_STALL_MS = 60_000;
export const READY_PING_MS = 2_000;
export const CLOCK_SKEW_TOLERANCE_MS = 5_000;
export const SKIPPED_CLOSED_MAX_AGE_MS = 259_200_000;

export const HEALTH_LEVELS = ['live', 'ready', 'ops'] as const;

export const HEALTH_REASONS = [
  'postgres-down',
  'redis-down',
  'workers-down',
  'scheduler-missing',
  'job-stalled',
] as const;

const ENV_MIN_MS = 1_000;
const ENV_MAX_MS = 2_147_483_647;

/**
 * Test overrides may be <1000 (e.g. 20 ms). Env values outside [1000, 2^31-1]
 * fall back to STOCKBIT_TIMEOUT_MS.
 */
export function resolveStockbitTimeoutMs(override?: number): number {
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return override;
  }
  const raw = process.env.STOCKBIT_TIMEOUT_MS;
  if (raw === undefined || raw === '') return STOCKBIT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < ENV_MIN_MS || parsed > ENV_MAX_MS) {
    return STOCKBIT_TIMEOUT_MS;
  }
  return parsed;
}
