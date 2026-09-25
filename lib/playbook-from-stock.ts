/**
 * Maps an /api/stock result into the pure playbook evaluator input, so the
 * decision card cannot drift from the evaluator. Degenerate Adi calculations
 * throw — the API already returned HTTP 422 before this point.
 */

import type { BrokerData, MarketData } from './types';
import type { CalculateTargetsResult } from './calculations';
import type { PlaybookInput } from './playbook';

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
  calculated: CalculateTargetsResult
): PlaybookInput {
  if (!calculated.ok) {
    throw new Error('degenerate_book');
  }

  return {
    harga: market.harga,
    ara: market.ara,
    arb: market.arb,
    fraksi: calculated.fraksi,
    totalBid: market.totalBid,
    totalOffer: market.totalOffer,
    totalPapan: calculated.totalPapan,
    rataRataBidOfer: calculated.rataRataBidOfer,
    rataRataBandar: broker.rataRataBandar,
    barangBandar: broker.barangBandar,
    bandarCode: broker.bandar || '',
    targetRealistis1: calculated.targetRealistis1,
    targetMax: calculated.targetMax,
  };
}

// Re-export for callers that want a single import surface.
export type { MarketData };
