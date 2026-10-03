/**
 * Phase 9 — Multi-Account Tranche Sizing Engine (Order Decomposer).
 *
 * Decomposes large institutional lot allocations into phased execution tranches
 * (Opening V15m confirmation, Continuous pullback, Pre-closing auction)
 * to minimize instantaneous market depth impact and adhere to IDX exchange caps.
 *
 * Invariants:
 * - IDX Exchange Maximum: 50,000 lots per individual order.
 * - Exact Integer Lots: Sum of all tranches strictly equals the input totalLots.
 * - Queue Impact Guard: Tranches exceeding queue depth trigger TWAP recommendations.
 */

export interface TrancheSizerInput {
  totalLots: number;
  entryPrice: number;
  adtvShares: number;
  avgQueueDepthLots: number;
}

export interface ExecutionTranche {
  trancheNumber: number;
  name: string;
  lotSize: number;
  targetSession: string;
  percentage: number;
  estimatedSlippageTicks: number;
}

export type MarketImpactLevel = 'NEGLIGIBLE_IMPACT' | 'MODERATE_MARKET_IMPACT' | 'HIGH_MARKET_IMPACT';
export type ExecutionMethod = 'SINGLE_BLOCK_ORDER' | 'TRANCHE_BREAKDOWN' | 'TIME_WEIGHTED_TWAP';

export interface TrancheSchedule {
  totalLots: number;
  tranches: ExecutionTranche[];
  marketImpactAlert: MarketImpactLevel;
  estimatedTotalSlippageTicks: number;
  recommendedExecutionMethod: ExecutionMethod;
}

const IDX_SINGLE_ORDER_LOT_CAP = 50000;

export function calculateTrancheSchedule(input: TrancheSizerInput): TrancheSchedule {
  const { totalLots, avgQueueDepthLots } = input;

  if (!Number.isFinite(totalLots) || totalLots <= 0) {
    return {
      totalLots: 0,
      tranches: [],
      marketImpactAlert: 'NEGLIGIBLE_IMPACT',
      estimatedTotalSlippageTicks: 0,
      recommendedExecutionMethod: 'SINGLE_BLOCK_ORDER',
    };
  }

  // 1. Small orders under 100 lots execute as a single block
  if (totalLots < 100) {
    return {
      totalLots,
      tranches: [
        {
          trancheNumber: 1,
          name: 'SINGLE_BLOCK',
          lotSize: totalLots,
          targetSession: 'Any Active Session',
          percentage: 100,
          estimatedSlippageTicks: 0,
        },
      ],
      marketImpactAlert: 'NEGLIGIBLE_IMPACT',
      estimatedTotalSlippageTicks: 0,
      recommendedExecutionMethod: 'SINGLE_BLOCK_ORDER',
    };
  }

  // 2. Assess market impact and queue depth ratio
  const queueImpactRatio = avgQueueDepthLots > 0 ? totalLots / avgQueueDepthLots : 1;
  const isHighImpact = queueImpactRatio > 2.0;

  const marketImpactAlert: MarketImpactLevel = isHighImpact
    ? 'HIGH_MARKET_IMPACT'
    : 'MODERATE_MARKET_IMPACT';

  const estimatedTotalSlippageTicks = isHighImpact ? Math.max(2, Math.ceil(queueImpactRatio)) : 1;
  const recommendedExecutionMethod: ExecutionMethod = isHighImpact
    ? 'TIME_WEIGHTED_TWAP'
    : 'TRANCHE_BREAKDOWN';

  // 3. Initial 3-phase split: 30% Opening, 40% Pullback, 30% Pre-closing
  const t1Lots = Math.floor(totalLots * 0.3);
  let t2Lots = Math.floor(totalLots * 0.4);
  const t3Lots = Math.floor(totalLots * 0.3);

  // Allocate integer remainder to Tranche 2 (largest)
  const remainder = totalLots - (t1Lots + t2Lots + t3Lots);
  t2Lots += remainder;

  const rawPhases = [
    { name: 'TRANCHE_1_OPENING', lots: t1Lots, session: '09:00 - 09:15 WIB (V15m)' },
    { name: 'TRANCHE_2_PULLBACK', lots: t2Lots, session: '10:00 - 14:30 WIB (Continuous)' },
    { name: 'TRANCHE_3_PRECLOSING', lots: t3Lots, session: '15:50 - 16:00 WIB (Pre-closing)' },
  ];

  // 4. Subdivide any phase that exceeds IDX_SINGLE_ORDER_LOT_CAP (50,000 lots)
  const finalTranches: ExecutionTranche[] = [];
  let trancheIndex = 1;

  for (const phase of rawPhases) {
    if (phase.lots <= IDX_SINGLE_ORDER_LOT_CAP) {
      finalTranches.push({
        trancheNumber: trancheIndex++,
        name: phase.name,
        lotSize: phase.lots,
        targetSession: phase.session,
        percentage: Number(((phase.lots / totalLots) * 100).toFixed(1)),
        estimatedSlippageTicks: isHighImpact ? 1 : 0,
      });
    } else {
      let remainingPhaseLots = phase.lots;
      let subPart = 1;
      while (remainingPhaseLots > 0) {
        const slice = Math.min(IDX_SINGLE_ORDER_LOT_CAP, remainingPhaseLots);
        finalTranches.push({
          trancheNumber: trancheIndex++,
          name: `${phase.name}_PART_${subPart++}`,
          lotSize: slice,
          targetSession: phase.session,
          percentage: Number(((slice / totalLots) * 100).toFixed(1)),
          estimatedSlippageTicks: 1,
        });
        remainingPhaseLots -= slice;
      }
    }
  }

  return {
    totalLots,
    tranches: finalTranches,
    marketImpactAlert,
    estimatedTotalSlippageTicks,
    recommendedExecutionMethod,
  };
}
