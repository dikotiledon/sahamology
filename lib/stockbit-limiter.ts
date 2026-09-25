export interface LimiterOptions {
  ratePerSec: number;
  burst: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RateLimiter {
  acquire(): Promise<void>;
}

/**
 * Simple token bucket over wall-clock milliseconds. `acquire()` waits until a
 * token is available, so callers serialize against Stockbit's tolerance
 * instead of hammering a personal JWT.
 */
export function createLimiter(opts: LimiterOptions): RateLimiter {
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const intervalMs = 1000 / opts.ratePerSec;
  let available = opts.burst;
  let lastRefill = now();

  return {
    async acquire() {
      for (;;) {
        const t = now();
        const elapsed = t - lastRefill;
        if (elapsed > 0) {
          available = Math.min(opts.burst, available + (elapsed / 1000) * opts.ratePerSec);
          lastRefill = t;
        }
        if (available >= 1) {
          available -= 1;
          return;
        }
        await sleep(intervalMs);
      }
    },
  };
}

export interface StockbitFetchDeps {
  fetch?: typeof fetch;
  limiter?: RateLimiter;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [1000, 2000, 4000, 8000];

// Module-level default so callers that pass no limiter share one bucket.
const defaultLimiter = createLimiter({ ratePerSec: 4, burst: 8 });

/**
 * Fetch through the Stockbit limiter with bounded retry on retryable statuses.
 * 401/403 are terminal — the caller's existing TokenExpiredError path owns them.
 */
export async function stockbitFetch(
  url: string,
  init: RequestInit,
  deps: StockbitFetchDeps = {}
): Promise<Response> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const limiter = deps.limiter ?? defaultLimiter;
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxRetries = deps.maxRetries ?? 4;

  let attempt = 0;
  for (;;) {
    await limiter.acquire();
    const response = await fetchImpl(url, init);

    if (!RETRYABLE_STATUS.has(response.status)) {
      return response;
    }

    if (attempt >= maxRetries) {
      throw new Error('Stockbit rate limited');
    }

    const retryAfter = Number(response.headers.get('Retry-After'));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt += 1;
    await sleep(delay);
  }
}
