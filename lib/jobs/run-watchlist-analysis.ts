import {
  fetchWatchlist,
  fetchMarketDetector,
  fetchOrderbook,
  getTopBroker,
  fetchEmitenInfo,
  fetchHistoricalSummary,
} from '@/lib/stockbit';
import { sessionDateJakarta, addTradingDays } from '@/lib/market-calendar';
import { calculateTargets } from '@/lib/calculations';
import {
  saveWatchlistAnalysis,
  updatePreviousDayRealPrice,
  createBackgroundJobLog,
  appendBackgroundJobLogEntry,
  updateBackgroundJobLog,
} from '@/lib/supabase';
import { getPriceHistory, saveDecisionJournal, getWatchlistAnalysisHistory } from '@/lib/db';
import { evaluatePlaybook } from '@/lib/playbook';
import { buildPlaybookInputFromStock } from '@/lib/playbook/from-stock';
import { defaultCostModel } from '@/lib/playbook/costs';
import { buildTapeSnapshot } from '@/lib/tape/snapshot';
import { ymdOf } from '@/lib/date-ymd';
import {
  resolveEmitensToAnalyze,
  selectUncapturedEmitens,
  countCapturedEmitens,
  type WatchlistUniverseItem,
} from './watchlist-universe';
import type { OhlcBar } from '@/lib/tape/ohlc';

export interface WatchlistAnalysisOutcome {
  success: boolean;
  results: number;
  errors: number;
  jobLogId: number | null;
  date: string;
}

/**
 * Core daily watchlist analysis loop.
 *
 * Ported from the former Netlify background function (deleted in this
 * migration). Runs as a BullMQ worker processor inside the Next.js server
 * process; it throws on critical failure so the queue can record a failed
 * job, while per-item failures are captured in the background_job_logs
 * table as before.
 */
export async function runWatchlistAnalysis(): Promise<WatchlistAnalysisOutcome> {
  const startTime = Date.now();
  let jobLogId: number | null = null;

  const today = sessionDateJakarta(new Date());

  // Fetch watchlist first to know total items.
  const watchlistResponse = await fetchWatchlist();
  const watchlistItems = watchlistResponse.data?.result || [];

  // The Stockbit watchlist is the primary emiten source. It can hold non-IDX
  // instruments (e.g. the USDIDR forex pair) that can never produce an IDX
  // signal; those are excluded and reported. When the watchlist yields no IDX
  // emiten at all, WATCHLIST_FALLBACK_EMITENS keeps the daily job productive.
  const { emitens, skipped, source: emitensSource, fallbackEmitens } =
    resolveEmitensToAnalyze(
      watchlistItems as WatchlistUniverseItem[],
      process.env.WATCHLIST_FALLBACK_EMITENS
    );

  if (emitens.length === 0) {
    const detail =
      watchlistItems.length === 0
        ? 'Stockbit watchlist is empty: add IDX stocks to the All Watchlist so the daily job can analyze them.'
        : `Watchlist has no IDX emitens (${skipped.length} non-IDX item(s), e.g. ${skipped
            .slice(0, 3)
            .map((s) => s.symbol)
            .join(', ')}). Add IDX stocks to the Stockbit All Watchlist.`;
    console.warn(`[Watchlist Job] No IDX emitens to analyze. ${detail}`);
    return { success: true, results: 0, errors: 0, jobLogId: null, date: today };
  }

  if (emitensSource !== 'stockbit-watchlist') {
    console.log(
      `[Watchlist Job] Emiten source: ${emitensSource}` +
        (fallbackEmitens.length > 0
          ? ` (WATCHLIST_FALLBACK_EMITENS contributed ${fallbackEmitens.join(', ')})`
          : '')
    );
  }

  // Create job log entry. The total is the number of IDX emitens actually
  // analyzed, not the raw watchlist size, so an all-forex watchlist reads as
  // zero rather than as a day of failures.
  try {
    const jobLog = await createBackgroundJobLog('analyze-watchlist', emitens.length);
    jobLogId = jobLog.id;
    console.log(`[Watchlist Job] Created job log with ID: ${jobLogId}`);
  } catch (logError) {
    console.error('[Watchlist Job] Failed to create job log, continuing without logging:', logError);
  }

  const results: { emiten: string; status: string }[] = [];
  const errors: { emiten: string; error: string }[] = [];

  // A session that already produced signals must not be re-captured. The
  // upsert in saveWatchlistAnalysis keys on (from_date, emiten), so a weekend,
  // holiday, or manual re-run would silently OVERWRITE the real close-of-day
  // signal with a stale one instead of failing loudly. `today` is already
  // rolled back to the last closed session by sessionDateJakarta, so a
  // non-trading-day run resolves to a date we have already recorded.
  const toAnalyze = [...emitens];
  let skippedCaptured = 0;
  try {
    const existing = await getWatchlistAnalysisHistory({
      fromDate: today,
      toDate: today,
      status: 'success',
      limit: 500,
    });
    const rows = (existing.data ?? []) as Array<{ emiten?: string | null }>;
    toAnalyze.splice(0, toAnalyze.length, ...selectUncapturedEmitens(emitens, rows));
    skippedCaptured = countCapturedEmitens(emitens, rows);
    if (skippedCaptured > 0) {
      console.warn(
        `[Watchlist Job] Session ${today} already has ${skippedCaptured} recorded signal(s); ` +
          'skipping those emitens to avoid overwriting a closed session.'
      );
    }
  } catch (historyError) {
    console.error(
      '[Watchlist Job] Failed to check for an existing session; proceeding without the guard',
      historyError
    );
  }

  for (const emiten of toAnalyze) {
    console.log(`[Watchlist Job] Analyzing ${emiten}...`);

    try {
      const [marketDetectorData, orderbookData, emitenInfoData] = await Promise.all([
        fetchMarketDetector(emiten, today, today),
        fetchOrderbook(emiten),
        fetchEmitenInfo(emiten).catch(() => null),
      ]);

      const brokerData = getTopBroker(marketDetectorData);
      if (!brokerData) {
        const errorMsg = 'No broker data available';
        errors.push({ emiten, error: errorMsg });
        if (jobLogId) {
          await appendBackgroundJobLogEntry(jobLogId, {
            level: 'warn',
            message: errorMsg,
            emiten,
          });
        }
        continue;
      }

      const sector = emitenInfoData?.data?.sector || undefined;
      const obData = orderbookData.data || (orderbookData as any);
      const offerPrices = (obData.offer || []).map((o: any) => Number(o.price));
      const bidPrices = (obData.bid || []).map((b: any) => Number(b.price));

      const marketData = {
        harga: Number(obData.close),
        ara: offerPrices.length > 0 ? Math.max(...offerPrices) : Number(obData.high || 0),
        arb: bidPrices.length > 0 ? Math.min(...bidPrices) : 0,
        totalBid: Number(obData.total_bid_offer.bid.lot.replace(/,/g, '')),
        totalOffer: Number(obData.total_bid_offer.offer.lot.replace(/,/g, '')),
      };

      const calculated = calculateTargets(
        brokerData.rataRataBandar,
        brokerData.barangBandar,
        marketData.ara,
        marketData.arb,
        marketData.totalBid / 100,
        marketData.totalOffer / 100,
        marketData.harga
      );

      if (!calculated.ok) {
        const errorMsg = 'Buku order tidak valid (degenerate_book)';
        errors.push({ emiten, error: errorMsg });
        if (jobLogId) {
          await appendBackgroundJobLogEntry(jobLogId, {
            level: 'warn',
            message: errorMsg,
            emiten,
          });
        }
        continue;
      }

      await saveWatchlistAnalysis({
        from_date: today,
        to_date: today,
        emiten,
        sector,
        bandar: brokerData.bandar,
        barang_bandar: brokerData.barangBandar,
        rata_rata_bandar: brokerData.rataRataBandar,
        harga: marketData.harga,
        ara: marketData.ara,
        arb: marketData.arb,
        fraksi: calculated.fraksi,
        total_bid: marketData.totalBid,
        total_offer: marketData.totalOffer,
        total_papan: calculated.totalPapan,
        rata_rata_bid_ofer: calculated.rataRataBidOfer,
        a: calculated.a,
        p: calculated.p,
        target_realistis: calculated.targetRealistis1,
        target_max: calculated.targetMax,
        status: 'success',
      });

      // Update previous day's record with close and high from historical data.
      try {
        const lookback = new Date();
        lookback.setDate(lookback.getDate() - 7);
        const historicalData = await fetchHistoricalSummary(
          emiten,
          lookback.toISOString().split('T')[0],
          today,
          5
        );
        if (historicalData.length > 0) {
          const latestData = historicalData[0];
          await updatePreviousDayRealPrice(emiten, today, latestData.close, latestData.high);
        }
      } catch (updateError) {
        console.error(`[Watchlist Job] Failed to update price for ${emiten}`, updateError);
      }

      // Journal the G4-aware decision card (best-effort; never fails the symbol).
      try {
        const [history, rows] = await Promise.all([
          getWatchlistAnalysisHistory({ emiten, limit: 4, status: 'success' }),
          getPriceHistory(emiten, addTradingDays(today, -40), addTradingDays(today, -1)),
        ]);
        const historyRows = (history.data ?? []) as Array<{ bandar?: string | null; from_date?: string | null }>;
        const priorBandar = historyRows
          .filter((row) => ymdOf(row.from_date) !== today)
          .map((row) => (row.bandar ? String(row.bandar).trim() : ''))
          .filter(Boolean);
        const tape = buildTapeSnapshot({
          bars: rows.map(
            (row): OhlcBar => ({
              date: ymdOf(row.date),
              open: Number(row.open ?? row.close ?? 0),
              high: Number(row.high ?? row.close ?? 0),
              low: Number(row.low ?? row.close ?? 0),
              close: Number(row.close ?? 0),
            })
          ),
          asOf: today,
          liveIncompleteToday: true,
          bandar: brokerData.rataRataBandar,
          todayBandar: brokerData.bandar,
          priorBandar,
        });
        const card = evaluatePlaybook(
          buildPlaybookInputFromStock({
            market: {
              harga: marketData.harga,
              ara: marketData.ara,
              arb: marketData.arb,
              totalBid: marketData.totalBid,
              totalOffer: marketData.totalOffer,
            },
            broker: brokerData,
            calculated,
            priorRows: historyRows,
            asOf: today,
            isIdxSession: true,
            tokenValid: true,
            costs: defaultCostModel(),
            tape,
          })
        );
        await saveDecisionJournal({
          emiten,
          as_of: today,
          card,
        });
      } catch (journalError) {
        console.error(`[Watchlist Job] Failed to journal decision card for ${emiten}`, journalError);
      }

      results.push({ emiten, status: 'success' });

      if (jobLogId) {
        await appendBackgroundJobLogEntry(jobLogId, {
          level: 'info',
          message: 'Successfully analyzed',
          emiten,
          details: {
            harga: marketData.harga,
            targetRealistis: calculated.targetRealistis1,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Watchlist Job] Error analyzing ${emiten}:`, error);
      errors.push({ emiten, error: errorMessage });

      if (jobLogId) {
        const isTokenError =
          errorMessage.includes('401') ||
          errorMessage.includes('unauthorized') ||
          errorMessage.includes('token') ||
          errorMessage.includes('authentication');

        await appendBackgroundJobLogEntry(jobLogId, {
          level: 'error',
          message: isTokenError ? 'Token authentication failed' : errorMessage,
          emiten,
          details: { isTokenError, originalError: errorMessage },
        });
      }
    }
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(
    `[Watchlist Job] Completed in ${duration}s. Success: ${results.length}, Errors: ${errors.length}` +
      (skippedCaptured > 0 ? `, Skipped (already captured): ${skippedCaptured}` : '')
  );

  if (jobLogId) {
    const hasErrors = errors.length > 0;
    await updateBackgroundJobLog(jobLogId, {
      status: hasErrors && results.length === 0 ? 'failed' : 'completed',
      success_count: results.length,
      error_count: errors.length,
      error_message: hasErrors ? `${errors.length} items failed` : undefined,
      metadata: {
        duration_seconds: duration,
        date: today,
        skipped_already_captured: skippedCaptured,
      },
    });
  }

  return {
    success: true,
    results: results.length,
    errors: errors.length,
    jobLogId,
    date: today,
  };
}
