import { NextRequest, NextResponse } from 'next/server';
import { sessionDateJakarta } from '@/lib/market-calendar';
import { getLatestVcpSnapshot, getLatestVcpUniverse, getPriceHistory, saveVcpPatternSnapshot } from '@/lib/db';
import { evaluateVcp, type PriceBar, type VcpAssessment } from '@/lib/vcp';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const emiten = searchParams.get('emiten')?.toUpperCase();
    const tradeDate = searchParams.get('date') || sessionDateJakarta(new Date());
    const lookback = searchParams.get('lookback') ? parseInt(searchParams.get('lookback')!, 10) : 60;

    if (emiten) {
      // 1. Check if snapshot is already stored in database for the given date
      try {
        const stored = await getLatestVcpSnapshot(emiten, tradeDate);
        if (stored && String(stored.trade_date) === tradeDate) {
          const contractions = Array.isArray(stored.contractions)
            ? stored.contractions
            : (typeof stored.contractions === 'string' ? JSON.parse(stored.contractions) : []);

          const mappedAssessment: VcpAssessment = {
            emiten,
            tradeDate: String(stored.trade_date),
            stage: (stored.vcp_stage as any) || 'DEVELOPING',
            trendTemplate: {
              passed: Boolean(stored.trend_template_passed),
              priceAboveSma50: true,
              priceAboveSma150: true,
              priceAboveSma200: true,
              smaAlignment: true,
              sma200TrendingUp: true,
              within25Pct52wHigh: Number(stored.pct_from_52w_high ?? 0) <= 25,
              atLeast25PctAbove52wLow: Number(stored.pct_from_52w_low ?? 0) >= 25,
              currentPrice: Number(stored.pivot_price ?? 0),
              sma50: Number(stored.sma_50 ?? 0),
              sma150: Number(stored.sma_150 ?? 0),
              sma200: Number(stored.sma_200 ?? 0),
              high52w: Number(stored.pivot_price ?? 0),
              low52w: Number(stored.stop_loss_price ?? 0),
              pctFrom52wHigh: Number(stored.pct_from_52w_high ?? 0),
              pctFrom52wLow: Number(stored.pct_from_52w_low ?? 0),
            },
            contractionCount: Number(stored.contraction_count ?? 0),
            contractions,
            pivotPrice: stored.pivot_price ? Number(stored.pivot_price) : null,
            stopLossPrice: stored.stop_loss_price ? Number(stored.stop_loss_price) : null,
            riskPct: stored.pivot_price && stored.stop_loss_price
              ? Number((((Number(stored.pivot_price) - Number(stored.stop_loss_price)) / Number(stored.pivot_price)) * 100).toFixed(2))
              : null,
            volumeDryUpRatio: stored.volume_dry_up_ratio ? Number(stored.volume_dry_up_ratio) : null,
            isVolumeDriedUp: stored.volume_dry_up_ratio ? Number(stored.volume_dry_up_ratio) <= 0.65 : false,
            confluenceTag: stored.confluence_tag ? String(stored.confluence_tag) : undefined,
            summary: `VCP snapshot tersimpan as of ${stored.trade_date} (${stored.vcp_stage}).`,
          };

          return NextResponse.json({
            status: 'success',
            data: mappedAssessment,
          });
        }
      } catch (dbErr) {
        console.warn(`[VCP API] Failed to fetch stored snapshot for ${emiten}:`, dbErr);
      }

      // 2. Fetch price bars from price_history table
      let bars: PriceBar[] = [];
      try {
        const rawBars = await getPriceHistory(emiten, '2024-01-01', tradeDate);
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
        console.warn(`[VCP API] Failed to fetch price history for ${emiten}:`, priceErr);
      }

      // 3. Evaluate VCP pattern & Trend Template
      const assessment = evaluateVcp(emiten, bars, { lookbackBars: lookback });

      // 4. Persist to database if we have enough bars
      if (bars.length >= 20) {
        try {
          await saveVcpPatternSnapshot({
            emiten,
            trade_date: tradeDate,
            trend_template_passed: assessment.trendTemplate.passed,
            sma_50: assessment.trendTemplate.sma50,
            sma_150: assessment.trendTemplate.sma150,
            sma_200: assessment.trendTemplate.sma200,
            pct_from_52w_high: assessment.trendTemplate.pctFrom52wHigh,
            pct_from_52w_low: assessment.trendTemplate.pctFrom52wLow,
            contraction_count: assessment.contractionCount,
            contractions: assessment.contractions,
            pivot_price: assessment.pivotPrice,
            stop_loss_price: assessment.stopLossPrice,
            volume_dry_up_ratio: assessment.volumeDryUpRatio,
            vcp_stage: assessment.stage,
            confluence_tag: assessment.confluenceTag ?? null,
          });
        } catch (saveErr) {
          console.warn(`[VCP API] Failed to cache snapshot for ${emiten}:`, saveErr);
        }
      }

      return NextResponse.json({
        status: 'success',
        data: assessment,
      });
    }

    // 5. Universe view when no emiten is provided
    try {
      const items = await getLatestVcpUniverse(tradeDate);
      return NextResponse.json({
        status: 'success',
        tradeDate,
        items,
      });
    } catch {
      return NextResponse.json({
        status: 'success',
        tradeDate,
        items: [],
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
