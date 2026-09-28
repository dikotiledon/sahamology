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
 * SCOPES (D14). This script repairs captures, and there are now two kinds that
 * fail independently: the micro capture (acc/dist + broker flow, flagged by
 * `capture_incomplete`) and the fundamentals capture (KeyStats, flagged by
 * `fundamentals_incomplete`). Each has its own SELECT, its own UPDATE, and its
 * own set of columns, because a repair that cleared the other scope's flag would
 * report a gap as filled when nothing was fetched for it.
 *
 *   --micro         re-fetch micro columns for rows with capture_incomplete
 *   --fundamentals  re-fetch KeyStats for rows with fundamentals_incomplete
 *   (neither)       a usage error. This script will not guess which capture you
 *                   meant, because "repair everything" is not a thing it can
 *                   honestly do.
 *
 * THE FUNDAMENTALS REPAIR IS MOSTLY GOING TO REPORT FAILURE, AND THAT IS
 * CORRECT. The KeyStats endpoint serves a CURRENT snapshot with no fiscal period
 * and no publication date, so a row whose capture failed on a day now past
 * cannot be backfilled: fetching today would grade a past decision with
 * present-day data, which is the exact lookahead this phase exists to exclude.
 * Those rows stay UNSCORED permanently. That is the honest state, and it is why
 * the ship gate carries an unscored cap instead of pretending coverage is
 * complete.
 *
 * Usage:
 *   npm run repair:captures -- --micro --fundamentals            # dry run
 *   npm run repair:captures -- --micro --fundamentals --apply    # re-fetch + write
 */

import { Pool } from 'pg';
import { fetchMarketDetector, fetchRunningTradeChartByBrokers } from '../lib/stockbit';
import { getTopBroker } from '../lib/stockbit';
import { buildMicroSnapshot, isBandarSellerOn } from '../lib/micro/snapshot';
import { FLOW_WINDOW } from '../lib/micro/flow';
import { captureBandFlow } from '../lib/jobs/micro-capture';
import { addTradingDays } from '../lib/market-calendar';
import type { BrokerFlowRow } from '../lib/micro/types';
import {
  REPAIR_SELECT_SQL,
  REPAIR_UPDATE_SQL,
  repairBlocker,
} from '../lib/micro/repair';
import {
  FUNDAMENTALS_REPAIR_SELECT_SQL,
  FUNDAMENTALS_REPAIR_UPDATE_SQL,
} from '../lib/fundamentals/repair';
import { fetchKeyStatsRaw } from '../lib/stockbit';
import { toSnapshotEntries, buildKeystatsSnapshotRows } from '../lib/jobs/fundamentals-capture';
import { saveKeystatsSnapshot } from '../lib/db';

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.env.REPAIR_LIMIT ?? '50');

/**
 * D14 scope split. `--micro` and `--fundamentals` repair independent captures:
 * the two flags are set by different vendor endpoints, fail for different
 * reasons, and are written by different columns. Running both together is
 * allowed and is the normal invocation; running NEITHER is a usage error rather
 * than a silent default, because "repair everything" is not a thing this script
 * can honestly do — each scope has its own SELECT and its own UPDATE.
 */
const WANT_MICRO = process.argv.includes('--micro');
const WANT_FUNDAMENTALS = process.argv.includes('--fundamentals');

function resolveScopes(): { micro: boolean; fundamentals: boolean } {
  const scopes = { micro: WANT_MICRO, fundamentals: WANT_FUNDAMENTALS };
  if (!WANT_MICRO && !WANT_FUNDAMENTALS) {
    console.error(
      'No scope requested. Pass --micro, --fundamentals, or both.\n' +
        '  --micro        re-fetch acc/dist and broker flow for rows with capture_incomplete\n' +
        '  --fundamentals re-fetch KeyStats for rows with fundamentals_incomplete\n' +
        'Neither flag means no repair; this script will not guess which capture you meant.',
    );
    process.exit(2);
  }
  return scopes;
}

const SCOPES = resolveScopes();

interface PendingRow {
  emiten: string;
  from_date: string;
  bandar: string | null;
  capture_incomplete: boolean;
}

interface FundamentalPendingRow {
  from_date: string;
  emiten: string;
  fundamentals_incomplete: boolean;
}

/**
 * The fundamentals scope, kept strictly apart from the micro one.
 *
 * The honest limit of this repair has to be stated up front: the KeyStats
 * endpoint serves a CURRENT snapshot, with no fiscal period and no publication
 * date. A row whose capture failed on a day now past therefore CANNOT be
 * backfilled — fetching today would grade a past decision with present-day
 * data, which is the exact lookahead this phase exists to exclude. Those rows
 * are reported as unrepairable and stay UNSCORED, which is the correct answer
 * and not a defect to work around.
 */
async function repairFundamentals(pool: Pool): Promise<void> {
  const { rows } = await pool.query<FundamentalPendingRow>(
    FUNDAMENTALS_REPAIR_SELECT_SQL,
    [LIMIT],
  );

  console.log(
    `\n[fundamentals] ${APPLY ? 'APPLY' : 'DRY RUN'}: ${rows.length} degraded KeyStats capture(s) found (limit ${LIMIT}).`,
  );
  if (rows.length === 0) {
    console.log('[fundamentals] nothing to repair.');
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

    if (!APPLY) {
      report.unrepairable.push({
        key,
        reason:
          'vendor serves a current snapshot only; a past session cannot be backfilled without lookahead',
      });
      continue;
    }

    try {
      const payload = await fetchKeyStatsRaw(row.emiten);
      const { entries, currency } = toSnapshotEntries(payload, row.emiten);
      if (entries.length === 0) {
        report.unrepairable.push({ key, reason: 'no keystats items in vendor response' });
        continue;
      }
      // The snapshot is written for `from_date` — the date the signal was
      // journaled — not for today. The UPDATE's EXISTS guard then refuses to
      // clear the flag unless a row for that exact date actually landed, so a
      // failed re-fetch cannot mark the row repaired.
      await saveKeystatsSnapshot(
        buildKeystatsSnapshotRows(entries, row.from_date, row.emiten, currency),
      );
      const cleared = await pool.query(FUNDAMENTALS_REPAIR_UPDATE_SQL, [
        row.from_date,
        row.emiten,
      ]);
      if ((cleared.rowCount ?? 0) === 0) {
        report.unrepairable.push({
          key,
          reason: 'snapshot write did not produce a row for this exact date',
        });
        continue;
      }
      report.repaired.push(key);
    } catch (error) {
      report.unrepairable.push({ key, reason: `keystats fetch failed: ${String(error)}` });
    }
  }

  console.log(JSON.stringify({ scope: 'fundamentals', ...report }, null, 2));
  if (report.unrepairable.length > 0) {
    console.error(
      `\n[fundamentals] ${report.unrepairable.length} capture(s) remain unrepairable and stay UNSCORED for the Phase 3 comparison.`,
    );
  }
  if (!APPLY) {
    console.log('\n[fundamentals] Dry run: nothing was written. Re-run with --apply to repair.');
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. This script cannot run without a database.');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    if (SCOPES.fundamentals) await repairFundamentals(pool);
    if (!SCOPES.micro) return;
    // Only incomplete rows. A complete row is never re-read, so this script
    // cannot overwrite a good capture with a fresh-but-different one.
    const { rows } = await pool.query<PendingRow>(REPAIR_SELECT_SQL, [LIMIT]);

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
      const blocked = repairBlocker(row.bandar);
      if (blocked) {
        report.unrepairable.push({ key, reason: blocked });
        continue;
      }
      const band = (row.bandar ?? '').toString().trim();

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
        await pool.query(REPAIR_UPDATE_SQL, [
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
