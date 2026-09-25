import { NextRequest, NextResponse } from 'next/server';
import { enqueueWatchlistAnalysis } from '@/lib/queue';

/**
 * POST /api/analyze-watchlist
 *
 * Enqueues a daily watchlist analysis job for the embedded BullMQ worker.
 * Requires `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
 * `proxy.ts` already performs the same check for all /api routes.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET;

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const jobId = await enqueueWatchlistAnalysis();

    return NextResponse.json({
      success: true,
      message: 'Watchlist analysis enqueued',
      jobId,
    });
  } catch (error) {
    console.error('Watchlist analysis enqueue error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
