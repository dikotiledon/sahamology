import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { runWatchlistAnalysis } from '@/lib/jobs/run-watchlist-analysis';
import { runStoryAnalysis, type StoryAnalysisInput } from '@/lib/jobs/run-story-analysis';

export const WATCHLIST_QUEUE_NAME = 'watchlist-analysis';
export const STORY_QUEUE_NAME = 'story-analysis';
export const DAILY_WATCHLIST_JOB_NAME = 'run-daily';
export const DAILY_WATCHLIST_CRON = '0 11 * * *';

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
let workersStarted = false;

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
export async function startWorkers(): Promise<void> {
  if (workersStarted) return;
  workersStarted = true;

  await ensureScheduledJobs().catch((error) => {
    console.error('[Queue] Failed to ensure scheduled jobs:', error);
  });

  const watchlistWorker = new Worker(
    WATCHLIST_QUEUE_NAME,
    async () => {
      await runWatchlistAnalysis();
    },
    { connection: resolveRedisOptions(), concurrency: 1 }
  );

  const storyWorker = new Worker(
    STORY_QUEUE_NAME,
    async (job) => {
      await runStoryAnalysis(job.data as StoryAnalysisInput);
    },
    { connection: resolveRedisOptions(), concurrency: 1 }
  );

  watchlistWorker.on('failed', (job, err) => {
    console.error(`[Queue] Watchlist job ${job?.id} failed:`, err.message);
  });
  storyWorker.on('failed', (job, err) => {
    console.error(`[Queue] Story job ${job?.id} failed:`, err.message);
  });

  console.log('[Queue] BullMQ workers started (watchlist-analysis, story-analysis)');
}
