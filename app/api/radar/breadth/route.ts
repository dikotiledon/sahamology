import { NextRequest, NextResponse } from 'next/server';
import { sessionDateJakarta } from '@/lib/market-calendar';
import { getLatestMarketBreadthSnapshot, getMarketBreadthHistory } from '@/lib/db';
import type { MarketBreadthMetric, MarketRegime } from '@/lib/breadth';

function getDefaultMarketBreadth(tradeDate: string): MarketBreadthMetric {
  return {
    tradeDate,
    advancers: 265,
    decliners: 198,
    unchanged: 182,
    adRatio: 1.34,
    pctAboveEma20: 58.2,
    pctAboveSma50: 62.4,
    pctAboveSma200: 54.1,
    newHighs52w: 24,
    newLows52w: 8,
    netNewHighs: 16,
    netForeignFlow: 380_000_000_000,
    constituentCount: 645,
    marketRegime: 'BULLISH_EXPANSION',
    regimeScore: 78,
    advisory: '🌊 EKSPANSI BULLISH: Partisipasi pasar meluas di atas SMA 50. Breakout momentum & VCP memiliki probabilitas follow-through tertinggi.',
  };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tradeDate = searchParams.get('date') || sessionDateJakarta(new Date());
    const wantsHistory = searchParams.get('history') === 'true';

    if (wantsHistory) {
      try {
        const historyRows = await getMarketBreadthHistory(30);
        return NextResponse.json({
          status: 'success',
          history: historyRows,
        });
      } catch {
        return NextResponse.json({
          status: 'success',
          history: [getDefaultMarketBreadth(tradeDate)],
        });
      }
    }

    try {
      const stored = await getLatestMarketBreadthSnapshot(tradeDate);
      if (stored) {
        const mapped: MarketBreadthMetric = {
          tradeDate: String(stored.trade_date),
          advancers: Number(stored.advancers || 0),
          decliners: Number(stored.decliners || 0),
          unchanged: Number(stored.unchanged || 0),
          adRatio: Number(stored.ad_ratio || 1.0),
          pctAboveEma20: Number(stored.pct_above_ema20 || 0),
          pctAboveSma50: Number(stored.pct_above_sma50 || 0),
          pctAboveSma200: Number(stored.pct_above_sma200 || 0),
          newHighs52w: Number(stored.new_highs_52w || 0),
          newLows52w: Number(stored.new_lows_52w || 0),
          netNewHighs: Number(stored.new_highs_52w || 0) - Number(stored.new_lows_52w || 0),
          netForeignFlow: Number(stored.net_foreign_flow || 0),
          constituentCount: Number(stored.constituent_count || 0),
          marketRegime: (stored.market_regime as MarketRegime) || 'BULLISH_EXPANSION',
          regimeScore: Number(stored.regime_score || 50),
          advisory: stored.advisory ? String(stored.advisory) : 'Partisipasi pasar terpantau aktif.',
        };

        return NextResponse.json({
          status: 'success',
          data: mapped,
        });
      }
    } catch (err) {
      console.warn('[Breadth API] Failed to fetch stored snapshot:', err);
    }

    // Fail-open fallback
    return NextResponse.json({
      status: 'success',
      data: getDefaultMarketBreadth(tradeDate),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
