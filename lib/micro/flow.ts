/**
 * Band-broker flow state (Phase 2, D9).
 *
 * The knobs are frozen a priori (D5): a 5-completed-session window, a
 * consistency floor of 60%, and at least 3 active days. These are NOT swept
 * on the IS fold — Phase 1 D7 established the project rule that knobs are
 * frozen and confirmed, never tuned in-sample. `F = 5` also matches the N=5
 * horizon the whole project already scores against.
 *
 * Two rules here are load-bearing and easy to get backwards:
 *
 *  1. A `spike` tier is NOT_EVALUATED even when a row exists. A one-day print
 *     has no flow history, so scoring it would be fabricating confidence.
 *
 *  2. `bad` requires the seller cross-check. A broker absent from that
 *     session's `brokers_sell` reading as "not a seller" — it must fall to
 *     `neutral`, never to `bad`. D20 makes this structural at the write.
 */

import type { BrokerFlowRow, FlowState, PersistenceTier } from './types';

/** Frozen flow lookback window in completed sessions (D5). */
export const FLOW_WINDOW = 5;
/** Frozen consistency floor, percent (D5). */
export const FLOW_CONSISTENCY_FLOOR = 60;
/** Frozen minimum active days within the window (D5). */
export const FLOW_MIN_ACTIVE_DAYS = 3;

export function flowState(args: {
  tier: PersistenceTier | null;
  row: BrokerFlowRow | null;
  isSeller: boolean | null;
}): FlowState {
  if (args.tier === null || args.tier === 'spike') return 'NOT_EVALUATED';
  if (args.row === null) return 'NOT_EVALUATED'; // coverage miss, not a verdict

  const { netValue, activeDays, consistencyPct } = args.row;
  if (!Number.isFinite(netValue) || !Number.isFinite(activeDays) || !Number.isFinite(consistencyPct)) {
    return 'NOT_EVALUATED'; // fail-closed on a fabricated numeric
  }

  if (netValue < 0 && args.isSeller === true) return 'bad'; // D9 seller cross-check

  if (
    netValue > 0 &&
    activeDays >= FLOW_MIN_ACTIVE_DAYS &&
    consistencyPct >= FLOW_CONSISTENCY_FLOOR
  ) {
    return 'ok'; // D5
  }

  return 'neutral';
}
