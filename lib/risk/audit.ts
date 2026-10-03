import { getIdxTickSize } from './sizer';

export interface AuditInput {
  plannedEntry: number;
  executedEntry: number;
  plannedR1: number;
  invalidationStop: number;
  lots: number;
  actualExitPrice?: number;
  buyFeePct?: number;
  sellFeePct?: number;
}

export interface AuditResult {
  slippageTicks: number;
  slippagePct: number;
  theoreticalNetRR: number;
  adjustedNetRR: number;
  isSuboptimalFill: boolean;
  realizedPnl: number | null;
  theoreticalPnl: number | null;
  efficiencyRatio: number | null;
}

/**
 * Calculates tick distance between two prices conforming to official IDX brackets.
 */
export function calculateTickDistance(p1: number, p2: number): number {
  if (p1 === p2) return 0;
  const low = Math.min(p1, p2);
  const high = Math.max(p1, p2);
  let ticks = 0;
  let curr = low;
  while (curr < high) {
    const step = getIdxTickSize(curr);
    curr += step;
    ticks += 1;
    if (ticks > 2000) break; // safety guard
  }
  return p2 >= p1 ? ticks : -ticks;
}

/**
 * Computes execution slippage, adjusted net risk-reward, and realized efficiency metrics.
 */
export function calculateExecutionAudit(input: AuditInput): AuditResult {
  const {
    plannedEntry,
    executedEntry,
    plannedR1,
    invalidationStop,
    lots,
    actualExitPrice,
    buyFeePct = 0.15,
    sellFeePct = 0.25,
  } = input;

  const slippageTicks = calculateTickDistance(plannedEntry, executedEntry);
  const slippagePct = Math.round((Math.abs(executedEntry - plannedEntry) / plannedEntry) * 100 * 1000) / 1000;

  // Theoretical Risk-Reward
  const theoReward = (plannedR1 - plannedEntry) - (plannedEntry * (buyFeePct / 100) + plannedR1 * (sellFeePct / 100));
  const theoRisk = (plannedEntry - invalidationStop) + (plannedEntry * (buyFeePct / 100) + invalidationStop * (sellFeePct / 100));
  const theoreticalNetRR = theoRisk > 0 ? Math.round((theoReward / theoRisk) * 100) / 100 : 0;

  // Adjusted Risk-Reward from actual executed entry
  const adjReward = (plannedR1 - executedEntry) - (executedEntry * (buyFeePct / 100) + plannedR1 * (sellFeePct / 100));
  const adjRisk = (executedEntry - invalidationStop) + (executedEntry * (buyFeePct / 100) + invalidationStop * (sellFeePct / 100));
  const adjustedNetRR = adjRisk > 0 ? Math.round((adjReward / adjRisk) * 100) / 100 : 0;

  const isSuboptimalFill = adjustedNetRR < 1.5;

  let realizedPnl: number | null = null;
  let theoreticalPnl: number | null = null;
  let efficiencyRatio: number | null = null;

  if (typeof actualExitPrice === 'number' && actualExitPrice > 0 && lots > 0) {
    const shares = lots * 100;
    const actualBuyCost = executedEntry * shares * (1 + buyFeePct / 100);
    const actualSellRev = actualExitPrice * shares * (1 - sellFeePct / 100);
    realizedPnl = Math.round(actualSellRev - actualBuyCost);

    const theoBuyCost = plannedEntry * shares * (1 + buyFeePct / 100);
    const theoSellRev = actualExitPrice * shares * (1 - sellFeePct / 100);
    theoreticalPnl = Math.round(theoSellRev - theoBuyCost);

    if (theoreticalPnl > 0) {
      efficiencyRatio = Math.round((realizedPnl / theoreticalPnl) * 1000) / 1000;
    }
  }

  return {
    slippageTicks,
    slippagePct,
    theoreticalNetRR,
    adjustedNetRR,
    isSuboptimalFill,
    realizedPnl,
    theoreticalPnl,
    efficiencyRatio,
  };
}
