/**
 * Maps an /api/stock result into the pure playbook evaluator input.
 *
 * Degenerate Adi calculations throw — the API already returned HTTP 422 before
 * this point. The optional context defaults (isIdxSession/tokenValid true)
 * exist only so legacy callers keep compiling during the evaluator migration;
 * the stock route must pass real values in Task R3.
 */

import type { BrokerData, MarketData } from './types';
import type { CalculateTargetsResult } from './calculations';
import type { PlaybookInput } from './playbook';
import type { CostModel } from './playbook/costs';
import { defaultCostModel } from './playbook/costs';
import { getBrokerInfo } from './brokers';

interface StockMarketInput {
  harga: number;
  ara: number;
  arb: number;
  totalBid: number;
  totalOffer: number;
}

export function playbookInputFromStock(
  _emiten: string,
  market: StockMarketInput,
  broker: Pick<BrokerData, 'bandar' | 'barangBandar' | 'rataRataBandar'>,
  calculated: CalculateTargetsResult,
  extra?: {
    isIdxSession?: boolean;
    tokenValid?: boolean;
    costs?: CostModel;
    priorBandar?: string[];
  }
): PlaybookInput {
  if (!calculated.ok) {
    throw new Error('degenerate_book');
  }

  return {
    harga: market.harga,
    ara: market.ara,
    arb: market.arb,
    totalBid: market.totalBid,
    totalOffer: market.totalOffer,
    bandar: broker.bandar || null,
    barangBandar: broker.barangBandar,
    rataRataBandar: broker.rataRataBandar,
    calculated,
    brokerType: getBrokerInfo(broker.bandar || '').type,
    priorBandar: extra?.priorBandar ?? [],
    isIdxSession: extra?.isIdxSession ?? true,
    tokenValid: extra?.tokenValid ?? true,
    costs: extra?.costs ?? defaultCostModel(),
  };
}

// Re-export for callers that want a single import surface.
export type { MarketData };
