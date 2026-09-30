import { NextResponse } from 'next/server';
import { getBackgroundJobLogs, getLatestBackgroundJobLog } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobName = searchParams.get('jobName') || undefined;
    const status = searchParams.get('status') || undefined;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const latest = searchParams.get('latest') === 'true';

    // If requesting latest only for a specific job
    if (latest && jobName) {
      const latestLog = await getLatestBackgroundJobLog(jobName);
      return NextResponse.json({
        success: true,
        data: latestLog ? [latestLog] : [],
        count: latestLog ? 1 : 0,
        checkedAt: new Date().toISOString(),
      });
    }

    const { data, count } = await getBackgroundJobLogs({
      jobName,
      status,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data,
      count,
      checkedAt: new Date().toISOString(),
      pagination: {
        limit,
        offset,
        total: count,
      },
    });
  } catch (error) {
    console.error('Error fetching job logs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job logs' },
      { status: 500 }
    );
  }
}
