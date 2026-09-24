/**
 * Next.js instrumentation hook.
 *
 * Runs once when the Next.js server process initializes (Node.js runtime only).
 * We use it to bootstrap the embedded BullMQ workers so the same PM2/Docker
 * process serves HTTP and processes background jobs.
 *
 * Workers are started fire-and-forget: the HTTP server must reach `Ready`
 * even when Redis is unreachable at boot. Queue operations retry on their own;
 * `lib/queue.ts` also guards against duplicate worker startup.
 *
 * Ref: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorkers } = await import('@/lib/queue');
    startWorkers().catch((error) => {
      console.error('[instrumentation] Failed to start background workers:', error);
    });
  }
}
