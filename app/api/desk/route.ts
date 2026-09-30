import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getCachedWatchlistGroups,
  getCachedWatchlistItems,
  listDecisionJournalByDate,
} from '@/lib/db';
import { assembleDesk, type JournalDeskRecord } from '@/lib/desk/assemble';
import { jakartaYmd, sessionDateJakarta } from '@/lib/market-calendar';

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const date =
      dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
        ? dateParam
        : sessionDateJakarta(new Date());

    const journals = (await listDecisionJournalByDate(date)) as unknown as JournalDeskRecord[];
    const groups = await getCachedWatchlistGroups();
    const watchlistItems: Array<{ symbol?: string; company_code?: string }> = [];
    for (const group of groups.groups) {
      const cached = await getCachedWatchlistItems(group.watchlist_id);
      watchlistItems.push(...cached.items);
    }

    const assembled = assembleDesk({
      asOf: date,
      wallDate: jakartaYmd(new Date()),
      journals,
      watchlistItems,
      fallbackEmitens: process.env.WATCHLIST_FALLBACK_EMITENS,
    });

    return NextResponse.json({
      success: true,
      data: {
        date: assembled.date,
        morningCard: assembled.morningCard,
        deskRows: assembled.deskRows,
        skipped: assembled.skipped,
      },
    });
  } catch (error) {
    console.error('desk API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
