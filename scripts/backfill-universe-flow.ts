/**
 * Universe Broker Flow Ingestion & Backfill Script.
 * Populates broker_flow_daily with multi-broker flow for the active universe tickers.
 *
 * Usage:
 *   npx tsx scripts/backfill-universe-flow.ts [--symbols BBCA,BBRI,TLKM] [--date 2026-10-02] [--days 15]
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchMarketDetector, fetchRunningTradeChartByBrokers } from '../lib/stockbit';
import { captureUniverseBrokerFlow } from '../lib/jobs/micro-capture';
import { saveBrokerFlowDaily, getUniverseBrokerFlowHistory } from '../lib/db';
import { sessionDateJakarta, addTradingDays } from '../lib/market-calendar';

const DEFAULT_FALLBACK_EMITENS = ['BBCA', 'BBRI', 'TLKM', 'BMRI', 'ASII', 'BBNI', 'BBTN', 'INDF'];

// Optional .env.local loader
try {
  const envContent = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([^#=]+?)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env.local may not exist in container environments where env vars are already injected
}

function parseCliOption(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

export async function runUniverseBrokerFlowBackfill(options?: {
  symbols?: string[];
  date?: string;
  days?: number;
}) {
  const date = options?.date || parseCliOption('--date', sessionDateJakarta(new Date()));
  const days = options?.days || parseInt(parseCliOption('--days', '15'), 10);
  const symbolsArg = parseCliOption('--symbols', '');
  const symbols = options?.symbols || (symbolsArg
    ? symbolsArg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    : [...DEFAULT_FALLBACK_EMITENS]);

  const fromDate = addTradingDays(date, -days);

  console.log(`[Universe Flow Backfill] Starting flow capture for ${symbols.length} emitens.`);
  console.log(`[Universe Flow Backfill] Date: ${date}, Window: ${fromDate} to ${date} (${days} trading days).`);

  const summary = {
    totalEmitens: symbols.length,
    processedEmitens: 0,
    totalFlowRowsSaved: 0,
    errors: [] as string[],
  };

  for (const emiten of symbols) {
    console.log(`\n--> Processing ${emiten}...`);
    try {
      // 1. Fetch Market Detector to discover top accumulation & distribution brokers
      console.log(`    Fetching market detector for ${emiten} as of ${date}...`);
      const detector = await fetchMarketDetector(emiten, date, date);
      console.log(`    detector.data keys:`, Object.keys(detector?.data || {}));
      console.log(`    broker_summary sample:`, JSON.stringify((detector?.data as any)?.broker_summary).slice(0, 300));
      const summaryData = (detector?.data as any)?.broker_summary || detector?.data || {};
      const buyBrokers = (summaryData.brokers_buy || [])
        .map((b: any) => String(b.netbs_broker_code || b.broker_code || '').trim().toUpperCase())
        .filter(Boolean);
      const sellBrokers = (summaryData.brokers_sell || [])
        .map((b: any) => String(b.netbs_broker_code || b.broker_code || '').trim().toUpperCase())
        .filter(Boolean);

      const candidateBrokers = Array.from(new Set([...buyBrokers.slice(0, 5), ...sellBrokers.slice(0, 5)]));

      if (candidateBrokers.length === 0) {
        console.log(`    [WARN] No brokers found in detector for ${emiten}. Skipping flow capture.`);
        continue;
      }

      console.log(`    Discovered ${candidateBrokers.length} top brokers: ${candidateBrokers.join(', ')}`);

      // 2. Fetch and parse running-trade flow via chunked captureUniverseBrokerFlow
      console.log(`    Querying running-trade chart (${fromDate} .. ${date}) in batches of <= 7...`);
      const flowResult = await captureUniverseBrokerFlow({
        emiten,
        brokerCodes: candidateBrokers,
        from: fromDate,
        to: date,
        fetchFlow: (sym, chunk, from, to) =>
          fetchRunningTradeChartByBrokers(sym, chunk, from, to, 'BOARD_TYPE_REGULAR'),
      });

      let savedForEmiten = 0;
      for (const [brokerCode, row] of flowResult.rows.entries()) {
        await saveBrokerFlowDaily({
          emiten,
          date,
          brokerCode,
          netValue: row.netValue,
          buyDays: row.buyDays,
          activeDays: row.activeDays,
          consistencyPct: row.consistencyPct,
          brokerSeenInDetector: true,
        });
        savedForEmiten++;
      }

      console.log(`    ✓ Saved ${savedForEmiten} broker flow rows for ${emiten} on ${date}.`);
      summary.totalFlowRowsSaved += savedForEmiten;
      summary.processedEmitens++;

      // Verify stored rows
      const history = await getUniverseBrokerFlowHistory(emiten, date);
      console.log(`    Current stored history for ${emiten}: ${history.length} records.`);
    } catch (err: any) {
      console.error(`    [ERROR] Failed to backfill flow for ${emiten}:`, err?.message || err);
      summary.errors.push(`${emiten}: ${err?.message || String(err)}`);
    }
  }

  console.log(`\n======================================================`);
  console.log(`[Universe Flow Backfill] Complete.`);
  console.log(`Processed: ${summary.processedEmitens}/${summary.totalEmitens} emitens.`);
  console.log(`Total flow rows stored: ${summary.totalFlowRowsSaved}`);
  if (summary.errors.length > 0) {
    console.log(`Errors encountered (${summary.errors.length}):`, summary.errors);
  }
  console.log(`======================================================\n`);

  return summary;
}

if (
  process.argv[1] &&
  (process.argv[1].includes('backfill-universe-flow') || process.argv[1].includes('backfill-flow'))
) {
  runUniverseBrokerFlowBackfill()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal backfill error:', err);
      process.exit(1);
    });
}
