/**
 * Maps an /api/stock result into the pure playbook evaluator input, so the
 * decision card cannot drift from the evaluator.
 *
 * The stock route is responsible for supplying live context (prior bandar
 * rows, token validity, session date, an already-open card); this module only
 * does the deterministic shape mapping and broker fold.
 */

import { getBrokerInfo } from '../brokers';
import { ymdOf } from '../date-ymd';
import type { CalculateTargetsResult } from '../calculations';
import type { MicroInput } from './types';
import type { CostModel } from './costs';
import type { PlaybookInput, Stance } from './types';
import type { TapeSnapshot } from '../tape/snapshot';
import type { FundamentalInput } from '../fundamentals/types';

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
  /** Phase 1 tape view; passed through unchanged when supplied. */
  tape?: TapeSnapshot;
  /**
   * Phase 2 G1 profile (D1). Passed through unchanged. Absent is equivalent to
   * 'phase-1', so every existing caller keeps byte-identical behaviour.
   */
  g1Profile?: 'phase-1' | 'phase-2';
  /**
   * Phase 2 micro snapshot (D1). Passed through unchanged; when absent the
   * evaluator must behave exactly as Phase 1 (Task 7 fixture 2).
   */
  micro?: MicroInput;
  /**
   * Phase 3 G5 profile (D1). Passed through unchanged; absent is 'off'.
   */
  g5Profile?: 'off' | 'visible' | 'veto';
  /**
   * Phase 3 fundamental reading (D11). Passed through unchanged. Absent means
   * "no fundamental layer", which G5 treats as NOT_EVALUATED — it fails OPEN.
   */
  fundamental?: FundamentalInput;
}

export function buildPlaybookInputFromStock(args: BuildPlaybookInputArgs): PlaybookInput {
  const { market, broker, calculated, priorRows, asOf, tokenValid, costs, openCard, isIdxSession, tape, g1Profile, micro, g5Profile, fundamental } = args;

  const priorBandar = priorRows
    .filter((row) => {
      const date = row.from_date ? ymdOf(row.from_date) : '';
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
    tape,
    // D1: passed through unchanged. `undefined` is meaningful here — the
    // evaluator treats an absent profile exactly as 'phase-1', which is what
    // keeps every pre-Phase-2 caller byte-identical.
    g1Profile,
    micro,
    // D1: same discipline as the two fields above — `undefined` is meaningful
    // and keeps every pre-Phase-3 caller byte-identical.
    g5Profile,
    fundamental,
  };
}
