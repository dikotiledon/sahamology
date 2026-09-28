/**
 * Adi-Only Baseline Backtest.
 *
 * Pulls every successful daily analysis from stock_queries, simulates each
 * signal against the following N trading-day candles in price_history using the
 * canonical playbook baseline evaluator, and writes the benchmark to
 * artifacts/adi-baseline.json. Every future signal layer must beat this number
 * out-of-sample before it is merged.
 *
 * Usage:
 *   npm run baseline:backtest [--horizon 5]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getPriceHistory, getSignalRecords } from '../lib/db';
import { evaluateAdiOnly, type BaselineTrade } from '../lib/playbook/baseline';
import { defaultCostModel } from '../lib/playbook/costs';
import { nextTradingDay, addTradingDays } from '../lib/market-calendar';

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
  const cache = new Map<string, { date: string; high: number; low: number; close: number }[]>();
  const trades: BaselineTrade[] = [];

  for (const signal of signals) {
    const entryDate = signal.from_date;
    const from = nextTradingDay(entryDate);
    const to = addTradingDays(entryDate, horizonDays);

    const cacheKey = `${signal.emiten}|${from}|${to}`;

    let bars = cache.get(cacheKey);
    if (!bars) {
      const rows = await getPriceHistory(signal.emiten, from, to);
      bars = rows.map((row) => ({
        date: String(row.date ?? ''),
        high: Number(row.high ?? row.close ?? 0),
        low: Number(row.low ?? row.close ?? 0),
        close: Number(row.close ?? 0),
      }));
      cache.set(cacheKey, bars);
    }

    trades.push({
      emiten: signal.emiten,
      signalDate: entryDate,
      entry: signal.harga,
      r1: signal.target_realistis,
      max: signal.target_max,
      // Phase 0 evaluator parity: min(arb, rataRataBandar * 0.97), not max.
      invalidation: Math.min(signal.arb, Math.round(signal.rata_rata_bandar * 0.97)),
      nextDayHigh: bars[0]?.high ?? null,
      path: bars.map((bar) => ({ date: bar.date, high: bar.high, low: bar.low, close: bar.close })),
    });
  }

  const report = evaluateAdiOnly(trades, defaultCostModel());

  mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'artifacts', 'adi-baseline.json'),
    JSON.stringify(report, null, 2) + '\n'
  );

  console.log('Adi-Only Baseline Backtest');
  console.log('==========================');
  console.log(`Signal records : ${signals.length}`);
  console.log(`Horizon        : ${horizonDays} trading days`);
  console.log('---');
  console.log(`Sample size    : ${report.sampleSize}`);
  console.log(`Next-day Hit R1: ${report.nextDayHitR1}`);
  console.log(`Next-day Hit Max: ${report.nextDayHitMax}`);
  console.log(
    `Expectancy R   : ${report.expectancyR === null ? 'n/a (no path data)' : report.expectancyR.toFixed(3)}`
  );
  console.log(
    `Profit Factor  : ${report.profitFactor === null ? 'n/a' : Number.isFinite(report.profitFactor) ? report.profitFactor.toFixed(2) : '∞'}`
  );
  console.log('---');
  console.log('Wrote artifacts/adi-baseline.json');

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
