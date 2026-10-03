import { NextRequest, NextResponse } from 'next/server';
import { sessionDateJakarta } from '@/lib/market-calendar';
import { getLatestWyckoffAssessment, getPriceHistory, saveWyckoffAssessment } from '@/lib/db';
import { classifyWyckoffStructure } from '@/lib/wyckoff';
import type { WyckoffBar } from '@/lib/wyckoff/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const emiten = searchParams.get('emiten')?.toUpperCase();
    const tradeDate = searchParams.get('date') || sessionDateJakarta(new Date());

    if (emiten) {
      // 1. Check if assessment is already cached/stored in database
      try {
        const stored = await getLatestWyckoffAssessment(emiten);
        if (stored && stored.trade_date === tradeDate) {
          return NextResponse.json({
            status: 'success',
            data: stored,
          });
        }
      } catch (dbErr) {
        console.warn(`[Wyckoff API] Failed to fetch stored assessment for ${emiten}:`, dbErr);
      }

      // 2. Fetch price bars from price_history table
      let bars: WyckoffBar[] = [];
      try {
        const rawBars = await getPriceHistory(emiten, '2025-01-01', tradeDate);
        if (Array.isArray(rawBars) && rawBars.length > 0) {
          bars = rawBars.map((r: Record<string, unknown>) => ({
            date: String(r.date),
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume),
          }));
        }
      } catch (priceErr) {
        console.warn(`[Wyckoff API] Failed to fetch price history for ${emiten}:`, priceErr);
      }

      // 3. Classify Wyckoff structure
      const assessment = classifyWyckoffStructure({
        emiten,
        bars,
      });

      // 4. Optionally persist if database is available and we have a valid classification
      if (bars.length >= 25 && assessment.phase !== 'WYCKOFF_UNCLASSIFIED') {
        try {
          await saveWyckoffAssessment({
            emiten,
            trade_date: tradeDate,
            current_phase: assessment.phase,
            confidence_score: assessment.confidenceScore,
            ice_level: assessment.tradingRange?.iceSupport ?? null,
            creek_level: assessment.tradingRange?.creekResistance ?? null,
            last_event: assessment.activeEvents[assessment.activeEvents.length - 1]?.type ?? null,
            spring_low: assessment.springLow ?? null,
            markup_readiness_score: assessment.markupReadinessScore,
          });
        } catch (saveErr) {
          console.warn(`[Wyckoff API] Failed to cache assessment for ${emiten}:`, saveErr);
        }
      }

      return NextResponse.json({
        status: 'success',
        data: assessment,
      });
    }

    // Universe view if no emiten specified
    return NextResponse.json({
      status: 'success',
      tradeDate,
      items: [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
