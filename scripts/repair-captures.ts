#!/usr/bin/env node
/**
 * Repair degraded Phase 2 captures (plan D18, audit finding F2).
 *
 * THE BUG THIS FIXES. The daily job skips any session that already has a
 * stock_queries row, and `saveWatchlistAnalysis` upserts on
 * `(from_date, emiten)`. So when a capture degrades — a flow fetch 429s, a
 * detector read fails — the job writes a row with NULL micro columns and then
 * treats that session as captured forever. Under D12 that signal is unscored
 * for system (3) permanently. Worse, D10(7)'s `unscoredShare` counts exactly
 * those rows, so an outage DEGRADES the gate's own coverage condition, and the
 * surviving sample is the easy one. One transient vendor timeout silently
 * deleted a sample from the only population that can ever validate Phase 2.
 *
 * WHAT THIS DOES. Re-fetches micro columns for rows where
 * `capture_incomplete = true`, and ONLY those. It never re-captures a complete
 * row, and it never touches price, target, or stance columns.
 *
 * WHAT IT CANNOT DO. It cannot re-derive `bandar_detector` for a past session
 * in a trustworthy way: the vendor block over a multi-day range is UNVERIFIED
 * (root gate G1), and there is no historical orderbook at all. So a repairable
 * row is repaired from a FRESH detector read for that day, and the script
 * reports honestly which rows it could not repair. A row that stays
 * unrepaired remains unscored — which is the honest state, not a default.
 *
 * Usage:
 *   npm run repair:captures              # dry run: report only, writes nothing
 *   npm run repair:captures -- --apply   # actually re-fetch and write
 */

import { Pool } from 'pg';
import { fetchMarketDetector, fetchRunningTradeChartByBrokers } from '../lib/stockbit';
import { getTopBroker } from '../lib/stockbit';
import { buildMicroSnapshot, isBandarSellerOn } from '../lib/micro/snapshot';
import { FLOW_WINDOW } from '../lib/micro/flow';
import { captureBandFlow } from '../lib/jobs/micro-capture';
import { addTradingDays } from '../lib/market-calendar';
import type { BrokerFlowRow } from '../lib/micro/types';

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.env.REPAIR_LIMIT ?? '50');

interface PendingRow {
  emiten: string;
  from_date: string;
  bandar: string | null;
  capture_incomplete: boolean;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. This script cannot run without a database.');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    // Only incomplete rows. A complete row is never re-read, so this script
    // cannot overwrite a good capture with a fresh-but-different one.
    const { rows } = await pool.query<PendingRow>(
      `SELECT emiten, from_date, bandar, capture_incomplete
         FROM stock_queries
        WHERE status = 'success'
          AND capture_incomplete = TRUE
          AND from_date <= CURRENT_DATE
        ORDER BY from_date DESC
        LIMIT $1`,
      [LIMIT],
    );

    console.log(
      `${APPLY ? 'APPLY' : 'DRY RUN'}: ${rows.length} incomplete capture(s) found (limit ${LIMIT}).`,
    );
    if (rows.length === 0) {
      console.log('Nothing to repair. Every captured signal is complete.');
      return;
    }

    const report = {
      scanned: rows.length,
      repaired: [] as string[],
      unrepairable: [] as { key: string; reason: string }[],
      dryRun: !APPLY,
    };

    for (const row of rows) {
      const key = `${row.emiten}/${row.from_date}`;
      const band = (row.bandar ?? '').toString().trim();
      if (band === '') {
        report.unrepairable.push({ key, reason: 'no band recorded; G1 would have blocked' });
        continue;
      }

      let detector: unknown = null;
      try {
        detector = await fetchMarketDetector(row.emiten, row.from_date, row.from_date);
      } catch (error) {
        report.unrepairable.push({ key, reason: `detector fetch failed: ${String(error)}` });
        continue;
      }

      const brokerData = getTopBroker(detector as never);
      if (!brokerData) {
        report.unrepairable.push({ key, reason: 'no broker data in detector response' });
        continue;
      }

      const sellerState = isBandarSellerOn(detector as never, band);
      const flow = await captureBandFlow({
        emiten: row.emiten,
        brokerCode: band,
        from: addTradingDays(row.from_date, -FLOW_WINDOW),
        to: row.from_date,
        brokerSeenInDetector: sellerState !== null,
        fetchFlow: fetchRunningTradeChartByBrokers,
      });

      const micro = buildMicroSnapshot({
        marketDetector: detector as never,
        bandCode: band,
        priorBandar: [],
        flowRow: flow.row,
        isSeller: sellerState,
        flowWindow: flow.window as BrokerFlowRow[],
      });

      if (micro.raw === null) {
        report.unrepairable.push({ key, reason: 'detector carried no bandar_detector block' });
        continue;
      }

      if (APPLY) {
        // ONLY the micro columns and the repair marker. Price, targets and
        // stance are untouched by construction.
        await pool.query(
          `UPDATE stock_queries
              SET accdist_overall = $3, accdist_top1 = $4, accdist_top3 = $5,
                  accdist_top5 = $6, accdist_avg = $7,
                  broker_total_buyer = $8, broker_total_seller = $9,
                  capture_incomplete = FALSE
            WHERE emiten = $1 AND from_date = $2`,
          [
            row.emiten,
            row.from_date,
            micro.raw.accdistOverall,
            micro.raw.accdistTop1,
            micro.raw.accdistTop3,
            micro.raw.accdistTop5,
            micro.raw.accdistAvg,
            micro.raw.brokerTotalBuyer,
            micro.raw.brokerTotalSeller,
          ],
        );
        if (flow.row) {
          await pool.query(
            `INSERT INTO broker_flow_daily
               (emiten, date, broker_code, net_value, buy_days, active_days, consistency_pct, broker_seen_in_detector)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (emiten, date, broker_code) DO UPDATE
               SET net_value = EXCLUDED.net_value,
                   buy_days = EXCLUDED.buy_days,
                   active_days = EXCLUDED.active_days,
                   consistency_pct = EXCLUDED.consistency_pct,
                   broker_seen_in_detector = EXCLUDED.broker_seen_in_detector`,
            [
              row.emiten,
              row.from_date,
              band,
              flow.row.netValue,
              flow.row.buyDays,
              flow.row.activeDays,
              flow.row.consistencyPct,
              flow.brokerSeenInDetector,
            ],
          );
        }
      }
      report.repaired.push(key);
    }

    console.log(JSON.stringify(report, null, 2));
    if (report.unrepairable.length > 0) {
      console.error(
        `\n${report.unrepairable.length} capture(s) remain unrepairable and stay UNSCORED for system (3).`,
      );
      console.error('That is the honest state. Do not default them — see D12.');
    }
    if (!APPLY) {
      console.log('\nDry run: nothing was written. Re-run with --apply to repair.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
