/**
 * Persistence tier (Phase 2, D6).
 *
 * Replaces the display-only persistence note in `evaluate.ts` with a scorable
 * quantity. The window is frozen at 3 prints because that is exactly what
 * `getPriorBandarCodes` (lib/db.ts) already returns and exactly what the brief
 * §4.3 sanctions. Widening it would shrink the sample for free.
 *
 * This replaces the thesis note; it does not add a new failure class of its
 * own. `null` means G1 already failed (no band today), so the tier
 * contributes nothing.
 */

import type { PersistenceTier } from './types';

/** Frozen lookback window in prints (D6). Must match getPriorBandarCodes' LIMIT 3. */
export const PERSISTENCE_WINDOW = 3;

export function persistenceTier(
  todayBandar: string | null,
  priorBandar: readonly string[],
): PersistenceTier | null {
  const today = todayBandar == null ? '' : String(todayBandar).trim();
  if (today === '') return null; // G1 already blocked: no bandar

  // A null/undefined prior window is treated as empty rather than a crash:
  // capture degradation must never throw into the signal loop.
  const prior = Array.isArray(priorBandar) ? priorBandar : [];

  const streak = 1 + prior.filter((c) => c == null || String(c).trim() === '' ? false : String(c).trim() === today).length;

  if (streak >= 3) return 'persistent';
  if (streak === 2) return 'building';
  return 'spike';
}
