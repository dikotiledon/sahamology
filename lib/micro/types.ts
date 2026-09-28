/**
 * Micro snapshot types (Phase 2, plan §5.1).
 *
 * These are the prospective per-signal micro record. Everything here is
 * either a raw captured value or an explicit `null`. There is deliberately no
 * "sensible default": a missing reading is a recorded state that maps to
 * UNKNOWN / NOT_EVALUATED and is counted against the ship gate's coverage
 * conditions (D10 5/6/7), never silently defaulted into a passing state.
 */

export type AccDistState = 'ACC' | 'SMALL_ACC' | 'NEUTRAL' | 'SMALL_DIST' | 'DIST' | 'UNKNOWN';

export type PersistenceTier = 'persistent' | 'building' | 'spike';

export type FlowState = 'ok' | 'bad' | 'neutral' | 'NOT_EVALUATED';

/** Numeric flow metrics for the band's own code over the decision window. */
export interface BrokerFlowRow {
  netValue: number;
  buyDays: number;
  activeDays: number;
  consistencyPct: number;
}

/** Raw vendor values, exactly as captured. `raw: null` when the block is absent. */
export interface MicroRaw {
  accdistOverall: string | null;
  accdistTop1: string | null;
  accdistTop3: string | null;
  accdistTop5: string | null;
  accdistAvg: string | null;
  brokerTotalBuyer: number | null;
  brokerTotalSeller: number | null;
  /** Adi `p` (barang_bandar / rata_rata_bid_ofer) — stored, not yet gated (D3). */
  brokerP: number | null;
}

/**
 * The prospective micro record captured alongside each signal.
 *
 * Capture failure is representable, not fatal (plan §5.1): `raw === null` or
 * `flow === null` is a recorded state, not an exception. The capture path
 * never throws into the signal loop.
 */
export interface MicroSnapshot {
  raw: MicroRaw | null;
  /** Band-broker flow for the signal session. `null` when capture failed (D18). */
  flow: BrokerFlowRow | null;
  /** Whether the band's code appeared in that session's `brokers_sell`. */
  flowIsSeller: boolean | null;
  /** The decision-time lookback, FLOW_WINDOW completed sessions, oldest first. */
  flowWindow: BrokerFlowRow[];
  /** Today's band code at capture time; `null` when G1 would already block. */
  bandCode: string | null;
  /** Prior successful prints' band codes, oldest first, window PERSISTENCE_WINDOW. */
  priorBandar: string[];
  /** Derived tier at capture time. Null when bandCode is null. */
  tier: PersistenceTier | null;
  /** Derived acc/dist state of the overall reading at capture time. */
  accdistState: AccDistState;
  /** Derived flow state at capture time. */
  flowState: FlowState;
  /**
   * D18: true when any micro input could not be captured. A degraded capture
   * writes this so `scripts/repair-captures.ts` can repair it later. The
   * capture guard otherwise treats the session as captured and never revisits
   * it, which would permanently remove the signal from the system-(3) sample.
   */
  captureIncomplete: boolean;
}
