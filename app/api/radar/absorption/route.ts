import { NextRequest, NextResponse } from 'next/server';
import { calculateAbsorptionScore } from '@/lib/flow/absorption';
import { classifyDivergenceRegime } from '@/lib/flow/divergence';
import { getLatestFlowAbsorption } from '@/lib/db';
import { sessionDateJakarta } from '@/lib/market-calendar';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const emiten = searchParams.get('emiten')?.toUpperCase();
    const tradeDate = searchParams.get('date') || sessionDateJakarta(new Date());

    if (emiten) {
      const stored = await getLatestFlowAbsorption(emiten);
      if (stored) {
        return NextResponse.json({
          status: 'success',
          data: stored,
        });
      }

      // If no stored row, return default calculation placeholder
      const absorption = calculateAbsorptionScore({
        top3Concentration5d: 0.3,
        netValue1d: 0,
        netValue3d: 0,
        netValue5d: 0,
        priceReturn5dPct: 0,
        barsCount: 0,
      });

      const divergence = classifyDivergenceRegime({
        adtv20d: 1_000_000_000,
        foreignNetVal5d: 0,
        retailNetVal5d: 0,
        domesticInstNetVal5d: 0,
      });

      return NextResponse.json({
        status: 'success',
        data: {
          emiten,
          tradeDate,
          absorption,
          divergence,
        },
      });
    }

    return NextResponse.json({
      status: 'success',
      tradeDate,
      message: 'Universe absorption summary',
      items: [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
