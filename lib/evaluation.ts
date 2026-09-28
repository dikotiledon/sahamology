/**
 * Unified trade evaluation engine — thin wrapper over the canonical
 * path-outcome scorer (lib/playbook/path-outcome.ts).
 *
 * Every signal layer must be scored through one engine so a hit is a real
 * simulated trade, not a next-day high watermark. The legacy "next-day touch"
 * metric remains available as `touchR1` for /summary parity.
 *
 * Empty paths and non-positive risk are unscored (return null), never a 0R
 * win at entry.
 */

import { roundTripCostRate, defaultCostModel, type CostModel } from './playbook/costs';
import { scorePath } from './playbook/path-outcome';

export interface CandleInput {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TradeEvaluationInput {
  /** Execution price, e.g. next session open after the signal day. */
  entryPrice: number;
  /** Take-profit level (Target Realistis 1). */
  targetR1: number;
  /** Invalidation level (stop). */
  invalidation: number;
  /** Maximum holding period in trading days. */
  horizonDays: number;
  /** Round-trip cost rate override; defaults to the documented IDX stand-in (0.006). */
  costRate?: number;
}

export interface TradeEvaluationResult {
  exit: 'target' | 'invalidation' | 'expiry';
  exitPrice: number;
  daysHeld: number;
  grossPnl: number;
  netPnl: number;
  /** Same-day touch of Target R1 (legacy /summary Hit R1). */
  touchR1: boolean;
  costRate: number;
}

export function evaluateTrade(
  input: TradeEvaluationInput,
  bars: CandleInput[]
): TradeEvaluationResult | null {
  const costRate = input.costRate ?? roundTripCostRate(defaultCostModel());
  const result = scorePath({
    entry: input.entryPrice,
    r1: input.targetR1,
    max: input.targetR1, // legacy surface has no max target
    invalidation: input.invalidation,
    costRate,
    bars,
  });

  if (result.unscored) return null;

  const exit =
    result.exit === 'max' || result.exit === 'r1' ? 'target' : result.exit;

  return {
    exit,
    exitPrice: result.exitPrice,
    daysHeld: result.daysHeld,
    grossPnl: result.pnl,
    netPnl: result.pnlAfterCosts,
    touchR1: result.touchR1,
    costRate,
  };
}

export interface BacktestSummary {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  avgNetPnl: number;
}

export function summarizeTrades(results: Array<TradeEvaluationResult | null>): BacktestSummary {
  const scored = results.filter((r): r is TradeEvaluationResult => r !== null);
  const trades = scored.length;
  const wins = scored.filter((r) => r.netPnl > 0).length;
  const losses = scored.filter((r) => r.netPnl <= 0).length;
  const grossProfits = scored
    .filter((r) => r.netPnl > 0)
    .reduce((sum, r) => sum + r.netPnl, 0);
  const grossLosses = scored
    .filter((r) => r.netPnl <= 0)
    .reduce((sum, r) => sum + Math.abs(r.netPnl), 0);
  const totalNet = scored.reduce((sum, r) => sum + r.netPnl, 0);

  return {
    trades,
    wins,
    losses,
    winRate: trades > 0 ? wins / trades : 0,
    expectancy: trades > 0 ? totalNet / trades : 0,
    profitFactor: grossLosses > 0 ? grossProfits / grossLosses : grossProfits > 0 ? Infinity : 0,
    avgNetPnl: trades > 0 ? totalNet / trades : 0,
  };
}

export type { CostModel };
