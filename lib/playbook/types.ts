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
import type { AccDistState, FlowState, PersistenceTier } from '../micro/types';
import type { FundamentalInput, FundamentalView } from '../fundamentals/types';
import type { G7Profile, MacroInput, MacroView } from '../macro/types';

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
  /**
   * Phase 2 G1 profile (D1). Absent or 'phase-1' produces a BYTE-IDENTICAL
   * Phase 1 card. The switch is read at the boundary (route / job), never
   * inside this pure evaluator, and defaults to 'phase-1' everywhere (D0).
   */
  g1Profile?: 'phase-1' | 'phase-2';
  /**
   * Phase 2 prospective micro snapshot (D1). Absent means "no micro layer",
   * which must never change a gate — a missing snapshot fails OPEN with a
   * label, never closed (plan Task 7 fixture 2).
   */
  micro?: MicroInput;
  /**
   * Phase 3 G5 profile (D1). Absent is 'off', and under 'off' the card is
   * BYTE-IDENTICAL to Phase 2 — that default is what makes it safe to ship the
   * capture layer while the gate is still being measured.
   *
   * Deliberately independent of `g1Profile`: the two gates are unrelated
   * experiments, and coupling them would let a micro-profile flip silently
   * change what the fundamental veto does.
   */
  g5Profile?: 'off' | 'visible' | 'veto';
  /**
   * Phase 3 fundamental reading (D11). Absent means "no fundamental layer",
   * which fails OPEN: G5 reports NOT_EVALUATED and never vetoes. This is the
   * deliberate opposite of G4, which fails closed on missing tape.
   */
  fundamental?: FundamentalInput;
  /**
   * Phase 4 G7 profile (D1). Absent is 'off', and under 'off' the card is
   * BYTE-IDENTICAL to Phase 3 — the default that makes it safe to ship the
   * capture and classification layers before any bound is measured.
   *
   * Independent of `g5Profile` for the same reason: the fundamental veto and
   * the macro regime are unrelated experiments, and coupling them would let a
   * G5 profile flip silently change what G7 does.
   */
  g7Profile?: G7Profile;
  /**
   * Phase 4 macro regime reading (D11). Absent means "no macro layer", which
   * fails OPEN: G7 reports NOT_EVALUATED and never holds a trade back. Same
   * reason as G5 — an unmeasured macro regime is an absence of evidence, and
   * a vendor outage must not silently delete ENTER signals.
   */
  macro?: MacroInput;
}

/**
 * The subset of the captured snapshot the evaluator reads. It is a display
 * + gate input, not a re-derivation: the contracts in lib/micro already
 * decided tier / accdistState / flowState at capture time, and the evaluator
 * only consumes them. That keeps the evaluator pure and the capture
 * reproducible.
 */
export interface MicroInput {
  bandCode: string | null;
  tier: PersistenceTier | null;
  accdistState: AccDistState;
  flowState: FlowState;
  /** False when the acc/dist reading was absent — drives the "not evaluated" label. */
  accdistEvaluated?: boolean;
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
  /**
   * Phase 2 micro view (D15). Present only when a micro snapshot was
   * supplied. It exists so the operator can tell whether a WAIT came from the
   * shipped rules or from a state that was never evaluated — a gate that is
   * silently inactive is the failure mode this project has been fighting
   * since Phase 0.
   */
  micro?: MicroView;
  /**
   * Phase 3 fundamental view (D15). Present whenever a fundamental reading
   * was supplied, whatever the profile — including under 'off', where it is
   * recorded but inert. Same reason as `micro`: an operator must be able to
   * see that a gate exists and is not currently armed, rather than inferring
   * it from its absence.
   */
  fundamental?: FundamentalView;
  /**
   * Phase 4 macro regime view. Present whenever a macro reading was supplied,
   * whatever the profile — including under 'off', where it is recorded but
   * inert. Same reason as `fundamental`: an operator must be able to see that
   * a regime reading exists and that G7 is not currently armed.
   */
  macro?: MacroView;
}

/** Display-only projection of the captured micro snapshot (plan §5.5). */
export interface MicroView {
  g1Profile: 'phase-1' | 'phase-2';
  bandCode: string | null;
  tier: PersistenceTier | null;
  accdistState: AccDistState;
  accdistEvaluated: boolean;
  flowState: FlowState;
}
