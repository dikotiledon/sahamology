/**
 * Closed acc/dist contract (Phase 2, D8).
 *
 * The string→state map below is the SINGLE source of truth for how a vendor
 * acc/dist string becomes a gate state. It is seeded from the vocabulary the
 * existing UI already branches on (`getAccDistClass` in
 * `app/components/BrokerSummaryCard.tsx`: 'acc' / 'neutral' / 'small dist' /
 * 'dist') and must be confirmed by root gate G1 before any acc/dist column is
 * trusted for a ship verdict. See the plan's follow-up F6: if a value with no
 * agreed semantic appears, EXTEND this map with an explicit UNKNOWN mapping
 * and record the decision — never guess a string inline.
 *
 * Design rules that are load-bearing (D8):
 *  - The enum is CLOSED at six states. A new vendor string can never widen it.
 *  - Matching is exact-after-normalize, never substring. Substring matching
 *    would let a vendor wording change silently re-route a gate (e.g.
 *    'Net Accumulation' containing 'acc').
 *  - Unrecognized / missing / the '-' sentinel all become UNKNOWN, which is
 *    NO-CHANGE-WITH-LABEL, never a block. Failing UNKNOWN closed would zero
 *    the gate on any session where Stockbit omits the block; the ship gate's
 *    coverage conditions (D10 5/6/7) are the honest control instead.
 */

import type { AccDistState } from './types';

export const ACCDIST_STATES: readonly AccDistState[] = [
  'ACC',
  'SMALL_ACC',
  'NEUTRAL',
  'SMALL_DIST',
  'DIST',
  'UNKNOWN',
];

/**
 * Lowercased, trimmed vendor string → state. Keys are already normalized, so
 * `parseAccDist` normalizes the input and looks it up directly.
 *
 * 'small acc' is included because the UI's `getAccDistClass` treats "acc and
 * not small" as the accumulation case, which implies a distinct small-accumulation
 * string exists in the vendor vocabulary even before G1 confirms it. Root gate
 * G1 settles whether it is observed in practice; until then it is mapped to a
 * no-change state, so an unconfirmed mapping cannot block or pass anything.
 */
export const ACCDIST_STRING_MAP: Readonly<Record<string, AccDistState>> = {
  acc: 'ACC',
  'small acc': 'SMALL_ACC',
  neutral: 'NEUTRAL',
  'small dist': 'SMALL_DIST',
  dist: 'DIST',
};

/** Only an unambiguous distribution blocks G1. Option F (SMALL_DIST blocks) was rejected. */
export const ACCDIST_BLOCKS_G1: ReadonlySet<AccDistState> = new Set<AccDistState>(['DIST']);

/**
 * Total function: any input yields a member of ACCDIST_STATES. Never throws,
 * never guesses, never returns a state outside the closed enum.
 */
export function parseAccDist(raw: string | null | undefined): AccDistState {
  if (raw == null) return 'UNKNOWN';
  const s = String(raw).trim().toLowerCase();
  if (s === '' || s === '-') return 'UNKNOWN'; // lib/stockbit.ts:322 sentinel
  const hit = ACCDIST_STRING_MAP[s];
  return hit ?? 'UNKNOWN';
}
