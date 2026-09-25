/**
 * Adi-Only Baseline Backtest.
 *
 * Pulls every successful daily analysis from stock_queries, simulates each
 * signal against the following 5 trading-day candles in price_history using the
 * unified evaluation engine, and publishes the benchmark Expectancy, Profit
 * Factor, Win Rate, and legacy Touch R1/Max. Every future signal layer must
 * beat this number out-of-sample before it is merged.
 *
 * Usage:
 *   npm run baseline:backtest [--horizon 5]
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPriceHistory, getSignalRecords } from '../lib/db';
import {
  CandleInput,
  evaluateTrade,
  summarizeTrades,
  TradeEvaluationResult,
} from '../lib/evaluation';

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
  // .env.local may not exist.
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const horizonDays = Number(option('--horizon', '5'));

  const signals = await getSignalRecords();
  if (signals.length === 0) {
    console.error('No Adi signal records found in stock_queries. Run a watchlist analysis first.');
    process.exit(1);
  }

  const cache = new Map<string, CandleInput[]>();
  const results: TradeEvaluationResult[] = [];
  let evaluated = 0;
  let skipped = 0;

  for (const signal of signals) {
    const entryDate = signal.from_date;
    const start = new Date(entryDate);
    start.setDate(start.getDate() + 1);
    const end = new Date(entryDate);
    end.setDate(end.getDate() + horizonDays + 1);

    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const cacheKey = `${signal.emiten}|${from}|${to}`;

    let bars = cache.get(cacheKey);
    if (!bars) {
      const rows = await getPriceHistory(signal.emiten, from, to);
      bars = rows.map((row) => ({
        open: Number(row.open ?? row.close ?? 0),
        high: Number(row.high ?? row.close ?? 0),
        low: Number(row.low ?? row.close ?? 0),
        close: Number(row.close ?? 0),
      }));
      cache.set(cacheKey, bars);
    }

    if (bars.length === 0) {
      skipped += 1;
      continue;
    }

    const entryPrice = bars[0].open;
    const invalidation = Math.max(signal.arb, Math.round(signal.rata_rata_bandar * 0.97));
    const result = evaluateTrade(
      {
        entryPrice,
        targetR1: signal.target_realistis,
        invalidation,
        horizonDays,
      },
      bars
    );
    results.push(result);
    evaluated += 1;
  }

  const summary = summarizeTrades(results);
  const touchR1 = results.filter((r) => r.touchR1).length;

  console.log('Adi-Only Baseline Backtest');
  console.log('==========================');
  console.log(`Signal records : ${signals.length}`);
  console.log(`Evaluated      : ${evaluated}`);
  console.log(`Skipped (no bar): ${skipped}`);
  console.log(`Horizon        : ${horizonDays} trading days`);
  console.log('---');
  console.log(`Win Rate       : ${(summary.winRate * 100).toFixed(2)}%`);
  console.log(`Expectancy     : ${summary.expectancy.toFixed(2)} pts/trade`);
  console.log(`Avg Net PnL    : ${summary.avgNetPnl.toFixed(2)} pts/trade`);
  console.log(`Profit Factor  : ${Number.isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : '∞'}`);
  console.log(`Touch R1 (legacy): ${touchR1}/${evaluated} (${((touchR1 / Math.max(evaluated, 1)) * 100).toFixed(2)}%)`);

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
