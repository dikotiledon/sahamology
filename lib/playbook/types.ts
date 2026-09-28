/**
 * Canonical playbook types for the G0–G4 decision evaluator.
 *
 * The gate vocabulary matches the accepted spec exactly:
 *   Stance  = ENTER | WAIT | AVOID | TAKE_PROFIT | INVALIDATED
 *   GateId  = G0..G7; G4 is live in Phase 1, G5–G7 are skipped rows.
 */

import type { CalculateTargetsResult } from '../calculations';
import type { BrokerType } from '../brokers';
import type { CostModel } from './costs';
import type { PatternName, TapeSnapshot } from '../tape/snapshot';

export type Stance = 'ENTER' | 'WAIT' | 'AVOID' | 'TAKE_PROFIT' | 'INVALIDATED';

export type GateId = 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';

export interface GateResult {
  id: GateId;
  pass: boolean;
  skipped?: boolean;
  reason: string;
}

export interface PlaybookInput {
  harga: number;
  ara: number;
  arb: number;
  totalBid: number;
  totalOffer: number;
  bandar: string | null;
  barangBandar: number;
  rataRataBandar: number;
  calculated: CalculateTargetsResult;
  brokerType: BrokerType;
  /** Last 3 successful prints' bandar codes, oldest first, excluding today. */
  priorBandar: string[];
  isIdxSession: boolean;
  tokenValid: boolean;
  costs: CostModel;
  openCard?: { stance: Stance };
  /** Phase 1 tape view. Absent → G4 fails closed (WAIT), never skipped. */
  tape?: TapeSnapshot;
  /**
   * Replay-only flag: the historical Phase 0 card evaluated G0–G3 with G4
   * skipped (Phase 0 semantics). Never set in the live path — live G4 is a
   * hard fail-closed gate.
   */
  replayG4Skipped?: boolean;
}

/** Display-only tape fields surfaced on the card. */
export interface TapeView {
  atr: number | null;
  ema20: number | null;
  emaSlope: 'up' | 'down' | null;
  trendOk: boolean;
  pattern: PatternName | null;
  barsUsed: number;
  invalidationSource: 'atr' | 'interim';
}

export interface PlaybookCard {
  stance: Stance;
  gates: GateResult[];
  entry: number | null;
  r1: number | null;
  max: number | null;
  invalidation: number | null;
  rr: number | null;
  thesis: string;
  failedGates: GateId[];
  tape?: TapeView;
}
