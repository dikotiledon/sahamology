/**
 * Maps an /api/stock result into the pure playbook evaluator input, so the
 * decision card cannot drift from the evaluator.
 *
 * The stock route is responsible for supplying live context (prior bandar
 * rows, token validity, session date, an already-open card); this module only
 * does the deterministic shape mapping and broker fold.
 */

import { getBrokerInfo } from '../brokers';
import type { CalculateTargetsResult } from '../calculations';
import type { CostModel } from './costs';
import type { PlaybookInput, Stance } from './types';

interface StockMarketInput {
  harga: number;
  ara: number;
  arb: number;
  totalBid: number;
  totalOffer: number;
}

export interface PriorBandarRow {
  bandar?: string | null;
  from_date?: string | null;
}

export interface BuildPlaybookInputArgs {
  market: StockMarketInput;
  broker: { bandar: string; barangBandar: number; rataRataBandar: number };
  calculated: CalculateTargetsResult;
  /** Successful watchlist history rows, newest first (as the DB helper returns). */
  priorRows: PriorBandarRow[];
  /** The query's toDate (YYYY-MM-DD), used to exclude today's own print. */
  asOf: string;
  /** Whether asOf is an IDX trading session (computed by the caller via market-calendar). */
  isIdxSession: boolean;
  tokenValid: boolean;
  costs: CostModel;
  openCard?: { stance: Stance };
}

export function buildPlaybookInputFromStock(args: BuildPlaybookInputArgs): PlaybookInput {
  const { market, broker, calculated, priorRows, asOf, tokenValid, costs, openCard, isIdxSession } = args;

  const priorBandar = priorRows
    .filter((row) => {
      const date = row.from_date ? String(row.from_date).slice(0, 10) : '';
      return date !== asOf;
    })
    .map((row) => (row.bandar ? String(row.bandar).trim() : ''))
    .filter(Boolean)
    .slice(0, 3)
    .reverse(); // oldest first, last-3 semantics

  return {
    harga: market.harga,
    ara: market.ara,
    arb: market.arb,
    totalBid: market.totalBid,
    totalOffer: market.totalOffer,
    bandar: broker.bandar.trim() || null,
    barangBandar: broker.barangBandar,
    rataRataBandar: broker.rataRataBandar,
    calculated,
    brokerType: getBrokerInfo(broker.bandar.trim()).type,
    priorBandar,
    isIdxSession,
    tokenValid,
    costs,
    openCard,
  };
}
