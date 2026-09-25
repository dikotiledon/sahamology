/**
 * Unified trade evaluation engine.
 *
 * Every signal layer must be scored through this engine so a hit is a real
 * simulated trade, not a next-day high watermark. The legacy "next-day touch"
 * metric remains available as `touchR1` / `touchMax` for /summary parity.
 */

export interface CandleInput {
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
}

export interface TradeEvaluationResult {
  exit: 'target' | 'invalidation' | 'expiry';
  exitPrice: number;
  daysHeld: number;
  grossPnl: number;
  netPnl: number;
  /** Same-day touch of Target R1 (legacy /summary Hit R1). */
  touchR1: boolean;
  /** Same-day touch of Target Max is tracked separately by the caller. */
}

/** IDX round-trip friction estimate: buy ~0.15% + sell ~0.25% incl. VAT/PPh. */
export const IDX_FRICTION = 0.004;

export function evaluateTrade(
  input: TradeEvaluationInput,
  bars: CandleInput[]
): TradeEvaluationResult {
  const { entryPrice, targetR1, invalidation } = input;

  if (bars.length === 0) {
    return {
      exit: 'expiry',
      exitPrice: entryPrice,
      daysHeld: 0,
      grossPnl: 0,
      netPnl: 0,
      touchR1: false,
    };
  }

  let exitPrice = entryPrice;
  let exit: TradeEvaluationResult['exit'] = 'expiry';
  let daysHeld = bars.length;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    // Conservative same-bar sequencing: stop is checked first because a bar
    // that trades through both levels must be assumed to stop out first.
    if (bar.low <= invalidation) {
      exit = 'invalidation';
      exitPrice = invalidation;
      daysHeld = i + 1;
      break;
    }
    if (bar.high >= targetR1) {
      exit = 'target';
      exitPrice = targetR1;
      daysHeld = i + 1;
      break;
    }
  }

  if (exit === 'expiry' && bars.length > 0) {
    exitPrice = bars[bars.length - 1].close;
  }

  const grossPnl = exitPrice - entryPrice;
  const netPnl = grossPnl - (entryPrice + exitPrice) * IDX_FRICTION;
  const touchR1 = bars.some((bar) => bar.high >= targetR1);

  return { exit, exitPrice, daysHeld, grossPnl, netPnl, touchR1 };
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

export function summarizeTrades(results: TradeEvaluationResult[]): BacktestSummary {
  const trades = results.length;
  const wins = results.filter((r) => r.netPnl > 0).length;
  const losses = results.filter((r) => r.netPnl <= 0).length;
  const grossProfits = results
    .filter((r) => r.netPnl > 0)
    .reduce((sum, r) => sum + r.netPnl, 0);
  const grossLosses = results
    .filter((r) => r.netPnl <= 0)
    .reduce((sum, r) => sum + Math.abs(r.netPnl), 0);
  const totalNet = results.reduce((sum, r) => sum + r.netPnl, 0);

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
