import { NextRequest, NextResponse } from 'next/server';
import { enqueueWatchlistAnalysis } from '@/lib/queue';

export async function POST(request: NextRequest) {
  try {
    const { jobName } = await request.json();

    if (jobName !== 'analyze-watchlist') {
      return NextResponse.json({ success: false, error: 'Unsupported job type' }, { status: 400 });
    }

    const jobId = await enqueueWatchlistAnalysis();
    console.log(`[Job Retry] Enqueued ${jobName} job ${jobId}`);

    return NextResponse.json({ success: true, data: { jobId } });
  } catch (error) {
    console.error('[Job Retry] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      error,
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
