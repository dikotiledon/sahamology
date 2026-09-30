import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { runWatchlistAnalysis } from '@/lib/jobs/run-watchlist-analysis';
import { runStoryAnalysis, type StoryAnalysisInput } from '@/lib/jobs/run-story-analysis';
import {
  runPriceHistoryBackfill,
  type PriceHistoryBackfillInput,
} from '@/lib/jobs/run-price-history-backfill';

export const WATCHLIST_QUEUE_NAME = 'watchlist-analysis';
export const STORY_QUEUE_NAME = 'story-analysis';
export const PRICE_HISTORY_QUEUE_NAME = 'price-history-backfill';
export const DAILY_WATCHLIST_JOB_NAME = 'run-daily';
// 11:00 UTC = 18:00 WIB, well after the 15:50 IDX close. Mon–Fri only: a
// weekend run has no broker prints and sessionDateJakarta would resolve back
// to the last closed session, re-capturing it.
export const DAILY_WATCHLIST_CRON = '0 11 * * 1-5';

/** Resolve Redis connection options from the environment. */
export function resolveRedisOptions(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (url) return { url };

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  return { host, port, password };
}

let watchlistQueue: Queue | undefined;
let storyQueue: Queue | undefined;
let priceHistoryQueue: Queue | undefined;
let workersStarted = false;
let schedulerOk = false;
let startedAt: number | null = null;
let startPromise: Promise<void> | undefined;

export interface WorkerStatus {
  workersStarted: boolean;
  startedAt: number | null;
  schedulerOk: boolean;
}

export function getWorkerStatus(): WorkerStatus {
  return { workersStarted, startedAt, schedulerOk };
}

export function __resetWorkerStatusForTests(): void {
  workersStarted = false;
  schedulerOk = false;
  startedAt = null;
  startPromise = undefined;
}

export interface StartWorkersDeps {
  Worker?: typeof Worker;
  ensureScheduledJobs?: () => Promise<void>;
}

/** Queue used for daily/manual watchlist analysis. */
export function getWatchlistQueue(): Queue {
  if (!watchlistQueue) {
    watchlistQueue = new Queue(WATCHLIST_QUEUE_NAME, {
      connection: resolveRedisOptions(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return watchlistQueue;
}

/** Queue used for AI story generation jobs. */
export function getStoryQueue(): Queue {
  if (!storyQueue) {
    storyQueue = new Queue(STORY_QUEUE_NAME, {
      connection: resolveRedisOptions(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return storyQueue;
}

export async function enqueueWatchlistAnalysis(): Promise<string> {
  const job = await getWatchlistQueue().add(DAILY_WATCHLIST_JOB_NAME, { timestamp: Date.now() });
  return String(job.id);
}

export async function enqueueStoryAnalysis(input: StoryAnalysisInput): Promise<string> {
  const job = await getStoryQueue().add('analyze', input);
  return String(job.id);
}

/** Queue used for manual price-history backfill (no daily cron in Phase 0). */
export function getPriceHistoryQueue(): Queue {
  if (!priceHistoryQueue) {
    priceHistoryQueue = new Queue(PRICE_HISTORY_QUEUE_NAME, {
      connection: resolveRedisOptions(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return priceHistoryQueue;
}

export async function enqueuePriceHistoryBackfill(input: PriceHistoryBackfillInput = {}): Promise<string> {
  const job = await getPriceHistoryQueue().add('backfill', input);
  return String(job.id);
}

/** Ensure the daily 11:00 UTC watchlist repeatable job is scheduled. */
export async function ensureScheduledJobs(): Promise<void> {
  await getWatchlistQueue().upsertJobScheduler(
    DAILY_WATCHLIST_JOB_NAME,
    { pattern: DAILY_WATCHLIST_CRON },
    { name: DAILY_WATCHLIST_JOB_NAME, data: { scheduled: true } }
  );
}

/**
 * Start embedded BullMQ workers.
 *
 * This must only run in the Node.js server runtime (not during `next build`),
 * and exactly once per process. Next.js dev mode can import modules multiple
 * times, so a module-level guard protects against duplicate worker instances.
 */
export async function startWorkers(deps: StartWorkersDeps = {}): Promise<void> {
  if (workersStarted) return;
  if (startPromise) return startPromise;
  startPromise = bootWorkers(deps);
  try {
    await startPromise;
  } finally {
    if (!workersStarted) startPromise = undefined;
  }
}

async function bootWorkers(deps: StartWorkersDeps): Promise<void> {
  const WorkerImpl = deps.Worker ?? Worker;
  const ensure = deps.ensureScheduledJobs ?? ensureScheduledJobs;

  schedulerOk = false;
  try {
    await ensure();
    schedulerOk = true;
  } catch (error) {
    console.error('[Queue] Failed to ensure scheduled jobs:', error);
    schedulerOk = false;
  }

  const constructed: Array<{ close: () => Promise<unknown> }> = [];
  try {
    const watchlistWorker = new WorkerImpl(
      WATCHLIST_QUEUE_NAME,
      async () => {
        const out = await runWatchlistAnalysis();
        if (!out.success) throw new Error('watchlist-job-failed');
      },
      { connection: resolveRedisOptions(), concurrency: 1 }
    );
    constructed.push(watchlistWorker);

    const storyWorker = new WorkerImpl(
      STORY_QUEUE_NAME,
      async (job) => {
        await runStoryAnalysis(job.data as StoryAnalysisInput);
      },
      { connection: resolveRedisOptions(), concurrency: 1 }
    );
    constructed.push(storyWorker);

    const priceHistoryWorker = new WorkerImpl(
      PRICE_HISTORY_QUEUE_NAME,
      async (job) => {
        await runPriceHistoryBackfill(job.data as PriceHistoryBackfillInput);
      },
      { connection: resolveRedisOptions(), concurrency: 1 }
    );
    constructed.push(priceHistoryWorker);

    workersStarted = true;
    startedAt = Date.now();

    watchlistWorker.on('failed', (job, err) => {
      console.error(`[Queue] Watchlist job ${job?.id} failed:`, err.message);
    });
    storyWorker.on('failed', (job, err) => {
      console.error(`[Queue] Story job ${job?.id} failed:`, err.message);
    });
    priceHistoryWorker.on('failed', (job, err) => {
      console.error(`[Queue] Price history backfill job ${job?.id} failed:`, err.message);
    });

    console.log('[Queue] BullMQ workers started (watchlist-analysis, story-analysis, price-history-backfill)');
  } catch (error) {
    await Promise.allSettled(constructed.map((w) => w.close()));
    workersStarted = false;
    startedAt = null;
    throw error;
  }
}
