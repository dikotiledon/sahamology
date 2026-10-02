import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { fetchMarketDetector } from '@/lib/stockbit';
import {
  getPriceHistory,
  getUniverseBrokerFlowHistory,
  getMacroSnapshotWindow,
  getCachedWatchlistGroups,
  getCachedWatchlistItems,
} from '@/lib/db';
import {
  evaluateRadar,
  marketDetectorToBrokerEntries,
  calculateRelativeStrength,
  summarizeSectorFlow,
  type RadarAssessment,
  type PriceCloseBar,
} from '@/lib/radar';
import { sessionDateJakarta, addTradingDays } from '@/lib/market-calendar';
import { resolveEmitensToAnalyze } from '@/lib/jobs/watchlist-universe';

const KNOWN_SECTOR_MAP: Record<string, string> = {
  BBCA: 'Financials',
  BBRI: 'Financials',
  BMRI: 'Financials',
  BBNI: 'Financials',
  BBTN: 'Financials',
  TLKM: 'Infrastructure',
  ASII: 'Industrials',
  INDF: 'Consumer Non-Cyclicals',
  ICBP: 'Consumer Non-Cyclicals',
  UNVR: 'Consumer Non-Cyclicals',
  ADRO: 'Energy',
  PTBA: 'Energy',
  PGAS: 'Energy',
  ANTM: 'Basic Materials',
  INCO: 'Basic Materials',
  MDKA: 'Basic Materials',
  CPIN: 'Consumer Non-Cyclicals',
  GOTO: 'Technology',
  BUKA: 'Technology',
  KLBF: 'Healthcare',
  MIKA: 'Healthcare',
  CTRA: 'Properties & Real Estate',
  BSDE: 'Properties & Real Estate',
  SMRA: 'Properties & Real Estate',
  PWON: 'Properties & Real Estate',
  JSMR: 'Infrastructure',
};

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

    const singleEmiten = searchParams.get('emiten')?.trim().toUpperCase();

    // 60 trading days prior to date for price history and flow
    const from60 = addTradingDays(date, -60);

    // Fetch IHSG benchmark bars for relative strength
    const rawIhsg = await getMacroSnapshotWindow('IHSG', date, 60).catch(() => []);
    const ihsgBars: PriceCloseBar[] = rawIhsg.map((b) => ({ close: b.close }));

    if (singleEmiten) {
      const assessment = await evaluateSingleEmiten(singleEmiten, date, from60, ihsgBars);
      return NextResponse.json({
        success: true,
        data: assessment,
      });
    }

    // Universe evaluation
    const universeEmitens = await resolveUniverseEmitens();
    const assessments: RadarAssessment[] = [];

    for (const symbol of universeEmitens) {
      try {
        const assessment = await evaluateSingleEmiten(symbol, date, from60, ihsgBars);
        assessments.push(assessment);
      } catch (err) {
        console.error(`[Radar API] Error evaluating ${symbol}:`, err);
      }
    }

    // Sort by radar score descending
    assessments.sort((a, b) => b.score - a.score);

    // Summarize sector capital flow (display-only)
    const sectorFlow = summarizeSectorFlow(assessments);

    return NextResponse.json({
      success: true,
      data: {
        asOf: date,
        total: assessments.length,
        items: assessments,
        sectorFlow,
      },
    });
  } catch (error) {
    console.error('[Radar API] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown radar API error' },
      { status: 500 }
    );
  }
}

async function evaluateSingleEmiten(
  emiten: string,
  asOf: string,
  from60: string,
  ihsgBars: PriceCloseBar[]
): Promise<RadarAssessment> {
  // 1. Fetch current EOD market detector
  let rgSummary: ReturnType<typeof marketDetectorToBrokerEntries> = [];
  try {
    const detector = await fetchMarketDetector(emiten, asOf, asOf);
    rgSummary = marketDetectorToBrokerEntries(detector);
  } catch (err) {
    console.warn(`[Radar API] Could not fetch detector for ${emiten} on ${asOf}:`, err);
  }

  // 2. Fetch price bars from price_history
  const rawBars = await getPriceHistory(emiten, from60, asOf).catch(() => []);
  const priceBars = (rawBars as Array<Record<string, unknown>>).map((b) => ({
    date: String(b.date).slice(0, 10),
    open: b.open != null ? Number(b.open) : null,
    high: b.high != null ? Number(b.high) : null,
    low: b.low != null ? Number(b.low) : null,
    close: Number(b.close) || 0,
    volume: Number(b.volume) || 0,
  }));

  // 3. Fetch historical multi-broker flow from broker_flow_daily
  const historicalFlow = await getUniverseBrokerFlowHistory(emiten, asOf).catch(() => []);

  // 4. Calculate average daily regular value if price bars exist
  let avgDailyRgValue = 0;
  if (priceBars.length > 0) {
    const values = (rawBars as Array<Record<string, unknown>>)
      .map((b) => Number(b.value))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (values.length > 0) {
      avgDailyRgValue = values.reduce((sum, v) => sum + v, 0) / values.length;
    }
  }

  const assessment = evaluateRadar({
    emiten,
    asOf,
    rgSummary,
    priceBars,
    avgDailyRgValue,
    historicalFlow,
  });

  // 5. Enrich with Relative Strength vs IHSG and Sector
  const rs = calculateRelativeStrength(priceBars, ihsgBars);
  if (rs) {
    assessment.relativeStrength = rs;
  }
  assessment.sector = KNOWN_SECTOR_MAP[emiten] || 'Unclassified';

  return assessment;
}

async function resolveUniverseEmitens(): Promise<string[]> {
  const items: Array<{ symbol?: string; company_code?: string }> = [];
  try {
    const cachedGroups = await getCachedWatchlistGroups();
    for (const group of cachedGroups.groups) {
      const cached = await getCachedWatchlistItems(group.watchlist_id);
      if (cached?.items?.length) {
        items.push(...cached.items);
      }
    }
  } catch {
    // fallback
  }

  return resolveEmitensToAnalyze(items, process.env.WATCHLIST_FALLBACK_EMITENS).emitens;
}
