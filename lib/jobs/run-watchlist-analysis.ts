import {
  fetchWatchlist,
  fetchMarketDetector,
  fetchOrderbook,
  getTopBroker,
  fetchEmitenInfo,
  fetchHistoricalSummary,
} from '@/lib/stockbit';
import { calculateTargets } from '@/lib/calculations';
import {
  saveWatchlistAnalysis,
  updatePreviousDayRealPrice,
  createBackgroundJobLog,
  appendBackgroundJobLogEntry,
  updateBackgroundJobLog,
} from '@/lib/supabase';

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

  const today = new Date().toISOString().split('T')[0];

  // Fetch watchlist first to know total items.
  const watchlistResponse = await fetchWatchlist();
  const watchlistItems = watchlistResponse.data?.result || [];

  if (watchlistItems.length === 0) {
    return { success: true, results: 0, errors: 0, jobLogId: null, date: today };
  }

  // Create job log entry.
  try {
    const jobLog = await createBackgroundJobLog('analyze-watchlist', watchlistItems.length);
    jobLogId = jobLog.id;
    console.log(`[Watchlist Job] Created job log with ID: ${jobLogId}`);
  } catch (logError) {
    console.error('[Watchlist Job] Failed to create job log, continuing without logging:', logError);
  }

  const results: { emiten: string; status: string }[] = [];
  const errors: { emiten: string; error: string }[] = [];

  for (const item of watchlistItems) {
    const emiten = item.symbol || item.company_code;
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
    `[Watchlist Job] Completed in ${duration}s. Success: ${results.length}, Errors: ${errors.length}`
  );

  if (jobLogId) {
    const hasErrors = errors.length > 0;
    await updateBackgroundJobLog(jobLogId, {
      status: hasErrors && results.length === 0 ? 'failed' : 'completed',
      success_count: results.length,
      error_count: errors.length,
      error_message: hasErrors ? `${errors.length} items failed` : undefined,
      metadata: { duration_seconds: duration, date: today },
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
