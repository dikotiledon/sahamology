import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { enqueuePriceHistoryBackfill } from '@/lib/queue';
import type { PriceHistoryBackfillInput } from '@/lib/jobs/run-price-history-backfill';

/**
 * POST /api/price-history/backfill
 *
 * Operator action: enqueue a watchlist OHLCV backfill into price_history.
 * Session-gated (not in proxy.ts PUBLIC_PATHS). No daily cron in Phase 0 —
 * trigger this explicitly.
 */
export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: Partial<PriceHistoryBackfillInput> = await request.json().catch(() => ({}));

    const input: PriceHistoryBackfillInput = {};
    if (typeof body.fromDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fromDate)) {
      input.fromDate = body.fromDate;
    }
    if (typeof body.toDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.toDate)) {
      input.toDate = body.toDate;
    }
    if (Array.isArray(body.symbols)) {
      input.symbols = body.symbols
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }

    const jobId = await enqueuePriceHistoryBackfill(input);

    return NextResponse.json({ success: true, data: { jobId } });
  } catch (error) {
    console.error('price-history backfill enqueue error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
