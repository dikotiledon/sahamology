/**
 * Canonical playbook types for the Phase 0 G0–G3 decision evaluator.
 *
 * The gate vocabulary matches the accepted spec exactly:
 *   Stance  = ENTER | WAIT | AVOID | TAKE_PROFIT | INVALIDATED
 *   GateId  = G0..G7; G4–G7 are present in the card but skipped in Phase 0.
 */

import type { CalculateTargetsResult } from '../calculations';
import type { BrokerType } from '../brokers';
import type { CostModel } from './costs';

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
}
