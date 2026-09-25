import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { saveDecisionJournal } from '@/lib/db';
import { buildJournalPayload } from '@/lib/playbook/journal-payload';
import type { PlaybookResult } from '@/lib/playbook';

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const emiten: unknown = body?.emiten;
    const asOf: unknown = body?.asOf ?? body?.as_of;
    const card: PlaybookResult | undefined = body?.card;

    if (typeof emiten !== 'string' || typeof asOf !== 'string' || !card) {
      return NextResponse.json(
        { success: false, error: 'emiten, as_of, and card are required' },
        { status: 400 }
      );
    }

    const payload = buildJournalPayload(emiten, asOf, card);
    await saveDecisionJournal({ ...payload });

    return NextResponse.json({ success: true, data: { emiten: payload.emiten, as_of: payload.as_of } });
  } catch (error) {
    console.error('decision-journal API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
