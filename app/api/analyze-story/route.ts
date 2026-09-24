import { NextRequest, NextResponse } from 'next/server';
import { createAgentStory, getAgentStoriesByEmiten, updateAgentStory } from '@/lib/supabase';
import { enqueueStoryAnalysis } from '@/lib/queue';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const emiten = searchParams.get('emiten')?.toUpperCase();

  if (!emiten) {
    return NextResponse.json({ error: 'Missing emiten parameter' }, { status: 400 });
  }

  try {
    const stories = await getAgentStoriesByEmiten(emiten);

    if (!stories || stories.length === 0) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No analysis found',
      });
    }

    return NextResponse.json({ success: true, data: stories });
  } catch (error) {
    console.error('Error fetching agent story:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch analysis' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const emiten = body.emiten?.toUpperCase();
    const keyStats = body.keyStats;

    if (!emiten) {
      return NextResponse.json({ error: 'Missing emiten parameter' }, { status: 400 });
    }

    // Create pending record.
    const story = await createAgentStory(emiten);

    // Enqueue the analysis for the embedded BullMQ worker.
    let jobId: string | null = null;
    try {
      jobId = await enqueueStoryAnalysis({
        storyId: story.id,
        emiten,
        keyStats,
      });
    } catch (triggerError) {
      console.error('Failed to enqueue story analysis:', triggerError);
      await updateAgentStory(story.id, {
        status: 'error',
        error_message: 'Gagal memulai proses analisis',
      });
      return NextResponse.json(
        { success: false, error: 'Failed to enqueue background analysis' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      data: story,
      jobId,
      message: 'Analysis started',
    });
  } catch (error) {
    console.error('Error starting agent story:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start analysis' },
      { status: 500 }
    );
  }
}
