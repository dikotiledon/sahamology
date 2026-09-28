import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketDetector, fetchOrderbook, getTopBroker, parseLot, getBrokerSummary, fetchEmitenInfo, fetchRunningTradeChartByBrokers } from '@/lib/stockbit';
import { calculateTargets } from '@/lib/calculations';
import { evaluatePlaybook } from '@/lib/playbook';
import { buildPlaybookInputFromStock } from '@/lib/playbook/from-stock';
import { classifyFundamentals } from '@/lib/fundamentals/rubric';
import { classifyRegime, REGIME_WINDOW } from '@/lib/macro/classifier';
import type { MacroInput, MacroSeries } from '@/lib/macro/types';

/**
 * Legs the live route reads for the regime.
 *
 * Only the legs a CAUTION can be raised from today. OIL and BRENT are captured
 * but not read here, because the commodity clause is sector-mapped and leaf
 * 1.2.2 has not measured that mapping — reading them would cost two queries
 * per request for bars nothing scores. Adding them is a one-line change once
 * the sector table exists.
 */
const MACRO_LIVE_LEGS: readonly MacroSeries[] = ['IHSG', 'USDIDR', 'XAU'];
import type { ReplayKeystatsSeries } from '@/lib/playbook/replay';
import { isFinancialIssuerEntries } from '@/lib/fundamentals/keystats-series';
import { getKeystatsSnapshot, getMacroSnapshotWindow } from '@/lib/db';
import type { FundamentalInput } from '@/lib/fundamentals/types';
import { defaultCostModel } from '@/lib/playbook/costs';
import { isWeekend, isIdxHoliday, jakartaYmd, addTradingDays } from '@/lib/market-calendar';
import { buildTapeSnapshot } from '@/lib/tape/snapshot';
import { buildMicroSnapshot, isBandarSellerOn } from '@/lib/micro/snapshot';
import { FLOW_WINDOW } from '@/lib/micro/flow';
import { captureBandFlow } from '@/lib/jobs/micro-capture';
import type { BrokerFlowRow } from '@/lib/micro/types';
import { ymdOf } from '@/lib/date-ymd';
import type { OhlcBar } from '@/lib/tape/ohlc';
import {
  saveStockQuery,
  getLatestStockQuery,
  getSpecificStockQuery as _getSpecificStockQuery,
  getStockPriceByDate,
  getWatchlistAnalysisHistory,
  getTokenStatus,
  listDecisionJournal,
  getPriceHistory,
} from '@/lib/supabase';
import type { StockInput, ApiResponse } from '@/lib/types';

/** Build the tape view from completed price_history bars (no today's running candle). */
function buildTape(
  emiten: string,
  asOf: string,
  liveIncompleteToday: boolean,
  bandar: number,
  todayBandar: string | null,
  priorBandar: string[]
) {
  const from = addTradingDays(asOf, -40);
  const to = liveIncompleteToday ? addTradingDays(asOf, -1) : asOf;
  return getPriceHistory(emiten, from, to).then((rows) =>
    buildTapeSnapshot({
      bars: rows.map(
        (row): OhlcBar => ({
          date: ymdOf(row.date),
          open: Number(row.open ?? row.close ?? 0),
          high: Number(row.high ?? row.close ?? 0),
          low: Number(row.low ?? row.close ?? 0),
          close: Number(row.close ?? 0),
        })
      ),
      asOf,
      liveIncompleteToday,
      bandar,
      todayBandar,
      priorBandar,
    })
  );
}

export async function POST(request: NextRequest) {
  try {
    const body: StockInput = await request.json();
    const { emiten, fromDate, toDate } = body;

    // Validate input
    if (!emiten || !fromDate || !toDate) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: emiten, fromDate, toDate' },
        { status: 400 }
      );
    }

    const isSingleDate = fromDate === toDate;
    const todayStr = jakartaYmd(new Date());
    const isToday = toDate === todayStr;

    // 2. Fetch data from both Stockbit APIs and emiten info
    const [marketDetectorData, orderbookData, emitenInfoData] = await Promise.all([
      fetchMarketDetector(emiten, fromDate, toDate),
      fetchOrderbook(emiten),
      fetchEmitenInfo(emiten).catch(() => null),
    ]);

    // Extract top broker data
    const brokerData = getTopBroker(marketDetectorData);

    if (!brokerData) {
       // Attempt to fetch latest historical data
       const historyData = await getLatestStockQuery(emiten);
       
       if (historyData) {
         return NextResponse.json({
           success: true,
           data: {
             input: { emiten, fromDate: historyData.from_date, toDate: historyData.to_date },
             stockbitData: {
               bandar: historyData.bandar,
               barangBandar: historyData.barang_bandar,
               rata_rata_bandar: historyData.rata_rata_bandar
             },
             marketData: {
                harga: historyData.harga,
                ara: historyData.ara,
                arb: historyData.arb,
                totalBid: historyData.total_bid,
                totalOffer: historyData.total_offer,
                fraksi: historyData.fraksi
             },
             calculated: {
                totalPapan: historyData.total_papan,
                rata_rata_bid_ofer: historyData.rata_rata_bid_ofer,
                a: historyData.a,
                p: historyData.p,
                target_realistis: historyData.target_realistis,
                target_max: historyData.target_max
             },
             brokerSummary: null,
             isFromHistory: historyData.from_date !== fromDate || historyData.to_date !== toDate,
             historyDate: historyData.from_date
           }
         });
       }

      return NextResponse.json(
        {
          success: false,
          error: 'Data broker tidak tersedia untuk periode ini (Market belum buka atau saham tidak aktif)'
        },
        { status: 404 }
      );
    }

    // Extract broker summary for the new card
    const brokerSummary = getBrokerSummary(marketDetectorData);

    // Extract sector from emiten info
    const sector = emitenInfoData?.data?.sector || undefined;

    // Extract market data
    const obData = orderbookData.data || (orderbookData as any);

    if (!obData.total_bid_offer || obData.close === undefined) {
      throw new Error('Invalid Orderbook API response structure');
    }

    // Default market data from orderbook (live)
    let marketData = {
      harga: Number(obData.close),
      ara: 0,
      arb: 0,
      totalBid: parseLot(obData.total_bid_offer.bid.lot),
      totalOffer: parseLot(obData.total_bid_offer.offer.lot),
    };

    const offerPrices = (obData.offer || []).map((o: { price: string }) => Number(o.price));
    const bidPrices = (obData.bid || []).map((b: { price: string }) => Number(b.price));

    marketData.ara = offerPrices.length > 0 ? Math.max(...offerPrices) : Number(obData.high || 0);
    marketData.arb = bidPrices.length > 0 ? Math.min(...bidPrices) : 0;

    // 3. For any non-today queries (past single dates or ranges), Override Price from Database (if available)
    if (!isToday) {
      const histPrice = await getStockPriceByDate(emiten, toDate);
      if (histPrice) {
        marketData = {
          harga: Number(histPrice.harga),
          ara: Number(histPrice.ara),
          arb: Number(histPrice.arb),
          totalBid: Number(histPrice.total_bid),
          totalOffer: Number(histPrice.total_offer),
        };
      }
    }

    // Calculate targets
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
      return NextResponse.json(
        {
          success: false,
          error: 'Buku order tidak valid untuk menghitung target (ARA/ARB atau bid/offer kosong).',
        },
        { status: 422 }
      );
    }

    // Prepare the decision card from live context: prior bandar persistence,
    // token validity, IDX session date, and any already-open card.
    const asOf = toDate;
    const [history, token, previous] = await Promise.all([
      getWatchlistAnalysisHistory({ emiten, limit: 4, status: 'success' }),
      getTokenStatus(),
      listDecisionJournal(emiten, 1),
    ]);

    const openCard =
      previous[0] &&
      ymdOf((previous[0] as Record<string, unknown>).as_of) < asOf &&
      (previous[0] as Record<string, unknown>).stance === 'ENTER'
        ? { stance: 'ENTER' as const }
        : undefined;

    const priorBandar = (history.data as Array<{ bandar?: string | null; from_date?: string | null }>)
      .filter((row) => ymdOf(row.from_date) !== asOf)
      .map((row) => (row.bandar ? String(row.bandar).trim() : ''))
      .filter(Boolean);

    const tape = await buildTape(
      emiten,
      asOf,
      isToday,
      brokerData.rataRataBandar,
      brokerData.bandar,
      priorBandar
    );

    // ---------------------------------------------------------------
    // Phase 2 micro capture (D2 / D19 / D20)
    //
    // D2: the MarketDetectorResponse is already in hand (fetched above), so
    // acc/dist costs zero extra calls.
    //
    // D19: the flow fetch is gated on `isToday`, exactly like the tape above.
    // The route reads the band from the LIVE getTopBroker (line 79) even when
    // `toDate` is a past date, while overriding price from the DB for
    // !isToday. Requesting a historical flow window for today's band would
    // fabricate a past-dated row whose broker was not the band then — and it
    // would double authenticated traffic on the hottest browser endpoint.
    //
    // D20: a flow row is only produced for a broker seen in the detector.
    const sellerState = isBandarSellerOn(marketDetectorData, brokerData.bandar);
    let flowRow: BrokerFlowRow | null = null;
    if (isToday && sellerState !== null) {
      const flow = await captureBandFlow({
        emiten,
        brokerCode: brokerData.bandar,
        from: addTradingDays(asOf, -FLOW_WINDOW),
        to: asOf,
        brokerSeenInDetector: true,
        fetchFlow: fetchRunningTradeChartByBrokers,
      });
      flowRow = flow.row;
    }

    const micro = buildMicroSnapshot({
      marketDetector: marketDetectorData,
      bandCode: brokerData.bandar,
      priorBandar,
      flowRow,
      isSeller: sellerState,
      flowWindow: flowRow ? [flowRow] : [],
      brokerP: calculated.p,
    });

    // Phase 3 fundamental reading.
    //
    // Gated on `isToday` for the same reason the tape and the flow are: the
    // KeyStats feed is a CURRENT snapshot with no fiscal period and no
    // publication date, so there is nothing date-addressable to request for a
    // historical session. A historical review reads the PERSISTED snapshot
    // (see the replay path) rather than re-fetching, because re-fetching would
    // grade a past decision with present-day data.
    //
    // Best effort by design: any failure yields `undefined`, which G5 treats as
    // NOT_EVALUATED and fails OPEN. A fundamentals problem must never break the
    // calculator.
    let fundamental: FundamentalInput | undefined;
    if (isToday) {
      try {
        const snapshot = await getKeystatsSnapshot(emiten, asOf);
        if (snapshot && snapshot.entries.length > 0) {
          // The issuer flag is DERIVED by the same helper the capture path
          // uses, never hard-coded. Hard-coding it false would re-introduce the
          // measured failure: every healthy bank (BBCA 5.14, BBNI 7.89, BMRI
          // 7.85, BBTN 13.52 liabilities/equity) would be vetoed on a
          // non-bank test — a 50% sample collapse on the live watchlist.
          const series: ReplayKeystatsSeries = {
            emiten: snapshot.emiten,
            isFinancialIssuer: isFinancialIssuerEntries(snapshot.entries),
            currency: null,
            entries: snapshot.entries,
            asOf: snapshot.asOf,
          };
          fundamental = classifyFundamentals(series);
        }
      } catch (error) {
        console.error('[stock route] fundamental snapshot read failed', error);
      }
    }

    // Phase 4 macro regime reading.
    //
    // Gated on `isToday` for the same reason the tape, the flow and the
    // KeyStats read are: a historical session must be graded from what was
    // PERSISTED at the time, never from today's bars. `getMacroSnapshotWindow`
    // is itself point-in-time (`bar_date <= asOf`), so the two constraints are
    // independent and both hold.
    //
    // Best effort by design, same as the fundamental read: any failure yields
    // `undefined`, which G7 treats as NOT_EVALUATED and fails OPEN. A macro
    // vendor outage must never break the calculator or delete a trade.
    let macro: MacroInput | undefined;
    if (isToday) {
      try {
        const series: Array<{ symbol: MacroSeries; closes: number[] }> = [];
        for (const symbol of MACRO_LIVE_LEGS) {
          const bars = await getMacroSnapshotWindow(symbol, asOf, REGIME_WINDOW + 1);
          if (bars.length === 0) continue;
          series.push({ symbol, closes: bars.map((b) => b.close) });
        }
        if (series.length > 0) {
          // The sector is a DISPLAY input, not a gate input: the commodity leg
          // is skipped until leaf 1.2.2 measures a sector->commodity table, and
          // a null sector is recorded as `sectorUnmapped` rather than guessed.
          macro = classifyRegime({ series, sector: null });
        }
      } catch (error) {
        console.error('[stock route] macro snapshot read failed', error);
      }
    }

    // Phase 4: resolve the G7 profile HERE, at the boundary, exactly like G5.
    // Anything unrecognised — including an unset variable — degrades to 'off',
    // so a typo in the deployment can never arm a hold.
    const g7Profile: 'off' | 'visible' | 'veto' =
      process.env.PLAYBOOK_G7_PROFILE === 'veto'
        ? 'veto'
        : process.env.PLAYBOOK_G7_PROFILE === 'visible'
          ? 'visible'
          : 'off';

    // Phase 3: resolve the G5 profile HERE, at the boundary, never inside the
    // pure evaluator. Anything unrecognised — including an unset variable —
    // degrades to 'off', so a typo in the deployment can never arm a veto.
    const g5Profile: 'off' | 'visible' | 'veto' =
      process.env.PLAYBOOK_G5_PROFILE === 'veto'
        ? 'veto'
        : process.env.PLAYBOOK_G5_PROFILE === 'visible'
          ? 'visible'
          : 'off';

    const playbook = evaluatePlaybook(
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
        priorRows: history.data as Array<{ bandar?: string | null; from_date?: string | null }>,
        asOf,
        isIdxSession: !isWeekend(asOf) && !isIdxHoliday(asOf),
        tokenValid: token.isValid,
        costs: defaultCostModel(),
        openCard,
        tape,
        // D1: the profile switch lives at the boundary, never inside the
        // evaluator. Default is 'phase-1' so the live card is unchanged.
        g1Profile: process.env.PLAYBOOK_G1_PROFILE === 'phase-2' ? 'phase-2' : 'phase-1',
        micro,
        g5Profile,
        fundamental,
        g7Profile,
        macro,
      })
    );

    const result: ApiResponse = {
      success: true,
      data: {
        input: { emiten, fromDate, toDate },
        stockbitData: brokerData,
        marketData: {
          ...marketData,
          fraksi: calculated.fraksi,
        },
        calculated: {
          totalPapan: calculated.totalPapan,
          rataRataBidOfer: calculated.rataRataBidOfer,
          a: calculated.a,
          p: calculated.p,
          targetRealistis1: calculated.targetRealistis1,
          targetMax: calculated.targetMax,
        },
        brokerSummary,
        sector,
        playbook,
      },
    };

    // 4. Save to Supabase ONLY if Single Date Query
    if (isSingleDate) {
      saveStockQuery({
        emiten,
        sector,
        from_date: fromDate,
        to_date: toDate,
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
      }).catch((err) => console.error('Failed to save to Supabase:', err));
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
