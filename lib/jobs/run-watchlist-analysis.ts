import {
  fetchWatchlist,
  fetchMarketDetector,
  fetchOrderbook,
  getTopBroker,
  fetchEmitenInfo,
  fetchHistoricalSummary,
  fetchRunningTradeChartByBrokers,
  fetchKeyStatsRaw,
} from '@/lib/stockbit';
import { sessionDateJakarta, addTradingDays } from '@/lib/market-calendar';
import { calculateTargets } from '@/lib/calculations';
import {
  saveWatchlistAnalysis,
  updatePreviousDayRealPrice,
  createBackgroundJobLog,
  appendBackgroundJobLogEntry,
  updateBackgroundJobLog,
  saveBrokerFlowDaily,
} from '@/lib/supabase';
import {
  getPriceHistory,
  saveDecisionJournal,
  getWatchlistAnalysisHistory,
  getPriorBandarCodes,
  saveKeystatsSnapshot,
} from '@/lib/db';
import { evaluatePlaybook } from '@/lib/playbook';
import { buildPlaybookInputFromStock } from '@/lib/playbook/from-stock';
import { defaultCostModel } from '@/lib/playbook/costs';
import { buildTapeSnapshot } from '@/lib/tape/snapshot';
import { buildMicroSnapshot, isBandarSellerOn } from '@/lib/micro/snapshot';
import { FLOW_WINDOW } from '@/lib/micro/flow';
import { captureBandFlow } from './micro-capture';
import { captureFundamentals } from './fundamentals-capture';
import { captureMacro, type MacroCaptureResult } from './macro-capture';
import { saveMacroSnapshot } from '../macro/store';
import { buildMacroPageFetcher } from '../macro/store';
import { ymdOf } from '@/lib/date-ymd';
import {
  resolveEmitensToAnalyze,
  selectUncapturedEmitens,
  countCapturedEmitens,
  type WatchlistUniverseItem,
} from './watchlist-universe';
import type { OhlcBar } from '@/lib/tape/ohlc';

/**
 * How far back the daily macro capture backfills.
 *
 * 120 trading days is chosen to cover the classifier's longest lookback with
 * room to spare, while staying inside one vendor window (the measured 365-day
 * cap) so a routine daily run never splits into a multi-window walk. A longer
 * backfill is a one-off repair concern, not a per-run cost.
 */
const MACRO_BACKFILL_TRADING_DAYS = 120;

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

  // Phase 4 G7 — macro capture, ONCE for the whole session.
  // Deliberately ABOVE the per-emiten loop, and this is the whole point of the
  // placement (D5). The four legs are market-wide: there is nothing an
  // individual emiten changes about where IHSG closed or what gold did. A fetch
  // inside the loop would multiply one read by the watchlist size and burn the
  // shared rate limiter on every run, in a job whose other calls are already
  // the hottest authenticated endpoints.
  //
  // `captureMacro` never throws, so a macro outage cannot abort the signal
  // loop or land on its error list. It degrades to `incomplete: true`, which
  // marks each signal `macro_incomplete` for the repair pass and leaves the
  // regime NOT_EVALUATED — G7 fails open, so the trade decision is untouched.
  const macroCapture: MacroCaptureResult = await captureMacro({
    fetchPage: buildMacroPageFetcher(),
    saveSnapshot: saveMacroSnapshot,
    capturedAt: new Date().toISOString(),
    from: addTradingDays(today, -MACRO_BACKFILL_TRADING_DAYS),
    to: today,
  });
  if (macroCapture.incomplete) {
    const detail = Object.entries(macroCapture.perSeries)
      .filter(([, v]) => !v.ok)
      .map(([k, v]) => `${k}: ${v.error ?? 'unknown'}`)
      .join('; ');
    console.warn(
      `[Watchlist Job] Macro capture incomplete (${macroCapture.rowCount} row(s)); ` +
        `G7 will report NOT_EVALUATED and signals are flagged macro_incomplete. ${detail}`,
    );
  } else {
    console.log(
      `[Watchlist Job] Macro capture complete: ${macroCapture.rowCount} bar(s) across ` +
        `${Object.keys(macroCapture.perSeries).length} series.`,
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

      // ---------------------------------------------------------------
      // Phase 2 micro capture (D2 / D4 / D18 / D20)
      //
      // D2: the MarketDetectorResponse is ALREADY in hand from the fetch above,
      // so acc/dist costs ZERO extra HTTP calls. This is the single most
      // important cost property in the plan — the detector is the hottest
      // authenticated endpoint and the limiter budget is 4/s burst 8.
      //
      // D18: a failed capture sets capture_incomplete so scripts/repair-captures.ts
      // can repair the row. Without it, the guard above would treat this
      // session as captured forever and the signal would be permanently
      // unscored for system (3) — a transient 429 deleting a sample.
      //
      // D20: a flow row is only ever written for a broker that appeared in
      // that session's detector listing.
      const priorBandar = await getPriorBandarCodes(emiten, today).catch(() => [] as string[]);
      const brokerSeenInDetector =
        isBandarSellerOn(marketDetectorData, brokerData.bandar) !== null;
      const flow = await captureBandFlow({
        emiten,
        brokerCode: brokerData.bandar,
        from: addTradingDays(today, -FLOW_WINDOW),
        to: today,
        brokerSeenInDetector,
        fetchFlow: fetchRunningTradeChartByBrokers,
      });
      const micro = buildMicroSnapshot({
        marketDetector: marketDetectorData,
        bandCode: brokerData.bandar,
        priorBandar,
        flowRow: flow.row,
        isSeller: isBandarSellerOn(marketDetectorData, brokerData.bandar),
        flowWindow: flow.window,
        brokerP: calculated.p,
      });

      if (flow.row) {
        // Best-effort: a flow-row write failure must not lose the signal.
        await saveBrokerFlowDaily({
          emiten,
          date: today,
          brokerCode: brokerData.bandar,
          netValue: flow.row.netValue,
          buyDays: flow.row.buyDays,
          activeDays: flow.row.activeDays,
          consistencyPct: flow.row.consistencyPct,
          brokerSeenInDetector: flow.brokerSeenInDetector,
        }).catch((e) => console.error(`[Watchlist Job] flow row save failed for ${emiten}`, e));
      }

      // Phase 3 fundamentals capture (D11 / D12).
      //
      // Exactly ONE KeyStats call per emiten per run. It runs AFTER the market
      // detector fetch rather than inside its Promise.all, because the detector
      // is the hottest authenticated endpoint and a KeyStats 429 must not delay
      // or perturb it.
      //
      // `captureFundamentals` never throws and never returns a rejected
      // promise, so a rate limit here cannot reach `errors[]` and cannot abort
      // the signal loop. G5 fails open, so the cost of a miss is one
      // NOT_EVALUATED signal flagged for the repair pass — never a lost trade.
      const fundamentals = await captureFundamentals({
        emiten,
        asOf: today,
        fetchKeyStatsRaw,
        saveSnapshot: saveKeystatsSnapshot,
      });

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
        // Phase 2 micro columns (D3) — this is the ONE writer (D21).
        accdist_overall: micro.raw?.accdistOverall ?? null,
        accdist_top1: micro.raw?.accdistTop1 ?? null,
        accdist_top3: micro.raw?.accdistTop3 ?? null,
        accdist_top5: micro.raw?.accdistTop5 ?? null,
        accdist_avg: micro.raw?.accdistAvg ?? null,
        broker_total_buyer: micro.raw?.brokerTotalBuyer ?? null,
        broker_total_seller: micro.raw?.brokerTotalSeller ?? null,
        broker_p: micro.raw?.brokerP ?? null,
        // D18: a degraded capture is repairable, not final.
        capture_incomplete: micro.captureIncomplete,
        // D11: a SEPARATE flag, so a missed fundamental read is repairable
        // without re-running the micro/flow repair pass and vice versa.
        fundamentals_incomplete: fundamentals.incomplete,
        // D14: likewise separate from both. The macro capture runs once per
        // session, so this flag is identical on every row for a given day —
        // which is correct: the outage was market-wide, not per-company, and a
        // `--macro` repair pass can therefore re-fetch the whole session in one
        // go rather than per emiten.
        macro_incomplete: macroCapture.incomplete,
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
