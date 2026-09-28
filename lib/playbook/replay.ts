/**
 * Historical G0–G3 replay: rebuild a PlaybookInput from a persisted
 * stock_queries row so the walk-forward can score the Phase 0 card (system 1)
 * against the Phase 1 card (system 2) on the same universe.
 *
 * Rows missing the book/bandar columns that G1/G2/G3 require are unscored
 * (null), never interpolated with Mix/true defaults — that would fabricate a
 * card that never existed.
 */

import { calculateTargets } from '../calculations';
import { getBrokerInfo } from '../brokers';
import { defaultCostModel } from './costs';
import { isWeekend, isIdxHoliday } from '../market-calendar';
import type { PlaybookInput } from './types';

export interface SignalRow {
  emiten: string;
  from_date: string;
  harga: number;
  ara?: number | null;
  arb: number;
  total_bid?: number | null;
  total_offer?: number | null;
  bandar?: string | null;
  barang_bandar?: number | null;
  rata_rata_bandar: number;
  target_realistis: number;
  target_max?: number | null;
}

/** Build a replay PlaybookInput, or null when required columns are missing. */
export function buildReplayInput(
  signal: SignalRow,
  priorBandar: string[]
): PlaybookInput | null {
  if (
    signal.total_bid === null ||
    signal.total_bid === undefined ||
    signal.total_offer === null ||
    signal.total_offer === undefined ||
    signal.ara === null ||
    signal.ara === undefined ||
    signal.barang_bandar === null ||
    signal.barang_bandar === undefined
  ) {
    return null;
  }

  const bandar = signal.bandar ? String(signal.bandar).trim() : null;
  const calculated = calculateTargets(
    signal.rata_rata_bandar,
    signal.barang_bandar,
    signal.ara,
    signal.arb,
    signal.total_bid / 100,
    signal.total_offer / 100,
    signal.harga
  );

  // A success row already existed, so the Stockbit token was valid at that
  // time. Session validity is derived from the calendar, not assumed.
  return {
    harga: signal.harga,
    ara: signal.ara,
    arb: signal.arb,
    totalBid: signal.total_bid,
    totalOffer: signal.total_offer,
    bandar,
    barangBandar: signal.barang_bandar,
    rataRataBandar: signal.rata_rata_bandar,
    calculated,
    brokerType: bandar ? getBrokerInfo(bandar).type : 'Mix',
    priorBandar,
    isIdxSession: !isWeekend(signal.from_date) && !isIdxHoliday(signal.from_date),
    tokenValid: true, // persisted success row implies the token was valid
    costs: defaultCostModel(),
  };
}
