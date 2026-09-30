import { resolveStockbitTimeoutMs } from './ops/constants';
import { activeFaults, consumeFault } from './faults';

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
  timeoutMs?: number;
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [1000, 2000, 4000, 8000];

const defaultLimiter = createLimiter({ ratePerSec: 4, burst: 8 });

export class StockbitTimeoutError extends Error {
  constructor(_url: string) {
    super(`Stockbit request timed out`);
    this.name = 'StockbitTimeoutError';
  }
}

/**
 * Fetch through the Stockbit limiter with bounded retry on retryable statuses.
 * 401/403 are terminal — the caller's existing TokenExpiredError path owns them.
 * Timeout is terminal and not retried.
 */
export async function stockbitFetch(
  url: string,
  init: RequestInit = {},
  deps: StockbitFetchDeps = {},
): Promise<Response> {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const limiter = deps.limiter ?? defaultLimiter;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = deps.maxRetries ?? 4;
  const timeoutMsSafe = resolveStockbitTimeoutMs(deps.timeoutMs);

  let attempt = 0;
  for (;;) {
    await limiter.acquire();

    if (activeFaults().has('stockbit-timeout')) {
      consumeFault('stockbit-timeout');
      throw new StockbitTimeoutError(url);
    }
    if (activeFaults().has('stockbit-429') && attempt === 0) {
      consumeFault('stockbit-429');
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      if (attempt >= maxRetries) throw new Error('Stockbit rate limited');
      attempt += 1;
      await sleep(delay);
      continue;
    }

    const response = await withDeadline(fetchImpl, url, init, timeoutMsSafe);
    if (!RETRYABLE_STATUS.has(response.status)) return response;
    if (attempt >= maxRetries) throw new Error('Stockbit rate limited');
    const retryAfter = Number(response.headers.get('Retry-After'));
    const rawDelay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    const delay = Math.min(rawDelay, 30_000);
    attempt += 1;
    await sleep(delay);
  }
}

async function withDeadline(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMsSafe: number,
): Promise<Response> {
  let timedOut = false;
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (init.signal) {
    if (init.signal.aborted) ac.abort();
    else init.signal.addEventListener('abort', onAbort, { once: true });
  }
  if (init.signal?.aborted || ac.signal.aborted) {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
      reject(new StockbitTimeoutError(url));
    }, timeoutMsSafe);
  });
  try {
    return await Promise.race([
      fetchImpl(url, { ...init, signal: ac.signal }),
      timeoutPromise,
    ]);
  } catch (e) {
    if (timedOut) throw e instanceof StockbitTimeoutError ? e : new StockbitTimeoutError(url);
    throw e;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (init.signal) init.signal.removeEventListener('abort', onAbort);
  }
}
