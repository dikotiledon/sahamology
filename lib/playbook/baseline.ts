/**
 * Adi-only baseline: "take every successful Adi print" scored on next-day hit
 * and N=5 expectancy after costs. This is the benchmark every future gate
 * (G1–G3 included) must beat out-of-sample. No gates are applied here.
 */

import { roundTripCostRate, type CostModel } from './costs';

export type BaselineTrade = {
  emiten: string;
  signalDate: string;
  entry: number; // harga on the signal row
  r1: number;
  max: number;
  invalidation: number;
  nextDayHigh?: number | null;
  path?: { date: string; high: number; low: number }[];
};

export type BaselineReport = {
  n: 5;
  sampleSize: number;
  nextDayHitR1: number;
  nextDayHitMax: number;
  expectancyR: number | null;
  profitFactor: number | null;
  notes: string[];
};

const N = 5;

export function evaluateAdiOnly(trades: BaselineTrade[], costs: CostModel): BaselineReport {
  const sampleSize = trades.length;
  const costRate = roundTripCostRate(costs);

  let nextDayHitR1 = 0;
  let nextDayHitMax = 0;
  let grossProfits = 0;
  let grossLosses = 0;
  let sumR = 0;
  let pathTrades = 0;

  for (const trade of trades) {
    if (typeof trade.nextDayHigh === 'number' && trade.nextDayHigh >= trade.r1) {
      nextDayHitR1 += 1;
    }
    if (typeof trade.nextDayHigh === 'number' && trade.nextDayHigh >= trade.max) {
      nextDayHitMax += 1;
    }

    if (!trade.path || trade.path.length === 0) continue;
    pathTrades += 1;

    const entry = trade.entry;
    const risk = entry - trade.invalidation;
    if (risk <= 0) continue;

    let exitPrice: number | null = null;
    for (const bar of trade.path) {
      // Stop-first sequencing: a bar that trades through both levels stops out.
      if (bar.low <= trade.invalidation) {
        exitPrice = trade.invalidation;
        break;
      }
      if (bar.high >= trade.max) {
        exitPrice = trade.max;
        break;
      }
      if (bar.high >= trade.r1) {
        exitPrice = trade.r1;
        break;
      }
    }

    if (exitPrice === null) {
      const last = trade.path[trade.path.length - 1];
      exitPrice = last.low > 0 ? last.high : entry; // no close in path; approximate
    }

    const pnl = exitPrice - entry;
    const pnlAfterCosts = pnl - (entry + exitPrice) * costRate;
    const rMultiple = pnlAfterCosts / risk;
    sumR += rMultiple;
    if (pnlAfterCosts > 0) grossProfits += pnlAfterCosts;
    else grossLosses += Math.abs(pnlAfterCosts);
  }

  return {
    n: N,
    sampleSize,
    nextDayHitR1,
    nextDayHitMax,
    expectancyR: pathTrades > 0 ? sumR / pathTrades : null,
    profitFactor: pathTrades > 0 ? (grossLosses > 0 ? grossProfits / grossLosses : grossProfits > 0 ? Infinity : 0) : null,
    notes: [
      'Adi-only: every status=success print is a trade; no G1–G3 applied.',
      'Path outcome is first-touch wins: stop before target; max before r1.',
      `Costs: buy ${costs.buyFeeRate}, sell ${costs.sellFeeRate}, haircut ${costs.spreadHaircutRate}.`,
      'expectancyR is null when price_history path data is missing.',
    ],
  };
}
