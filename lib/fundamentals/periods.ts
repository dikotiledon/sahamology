/**
 * Phase 3 G5 — point-in-time qualification.
 *
 * PURE. No clock, no I/O, no environment.
 *
 * The pre-audit plan modelled a `PUBLICATION_LAG_DAYS = 90` buffer over annual
 * fiscal periods. That model was deleted after the live probe: the KeyStats
 * payload carries no fiscal period and no publication date, so there is no
 * filing date for a lag to sit behind. Inventing one would have produced a
 * constant that looked rigorous and did nothing.
 *
 * What remains is the CAPTURE date, and it is a hard boundary. A signal dated
 * D may only read a snapshot captured on or before D. A later capture is
 * lookahead — grading a historical decision with data that did not exist when
 * the decision was made — and it is the failure mode that silently inflates
 * every backtest, so it is enforced here rather than trusted to callers.
 */

/** An `YYYY-MM-DD` calendar date, with no time component. */
export type IsoDate = string;

/** The minimum a snapshot row must carry to be point-in-time usable. */
export interface SnapshotStamp {
  emiten: string;
  /** The `as_of` capture date, `YYYY-MM-DD`. */
  asOf: IsoDate;
}

/**
 * Strict `YYYY-MM-DD` validation.
 *
 * Deliberately rejects a full ISO timestamp: `'2026-09-28T00:00:00Z'` sorts
 * after `'2026-09-28'` lexicographically, which would turn a same-day capture
 * into a false lookahead rejection.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDate = (value: unknown): value is IsoDate =>
  typeof value === 'string' && ISO_DATE.test(value);

/**
 * Is a snapshot captured on `snapshotAsOf` knowable for a signal dated
 * `signalDate`?
 *
 * True only when both dates are well-formed and the snapshot is not newer.
 */
export function isPointInTimeValid(snapshotAsOf: unknown, signalDate: unknown): boolean {
  if (!isIsoDate(snapshotAsOf) || !isIsoDate(signalDate)) return false;
  return snapshotAsOf <= signalDate;
}

/**
 * Choose the newest snapshot that was knowable on `signalDate`.
 *
 * Returns `null` when nothing qualifies — including the case where every
 * candidate is strictly in the future. Callers turn that into
 * `NOT_EVALUATED`; it is never a licence to fall back to the latest row.
 */
export function selectPointInTimeSnapshot<T extends SnapshotStamp>(
  snapshots: readonly T[],
  signalDate: unknown,
  emiten?: string,
): T | null {
  if (!Array.isArray(snapshots)) return null;

  let best: T | null = null;
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    if (emiten !== undefined && snapshot.emiten !== emiten) continue;
    if (!isPointInTimeValid(snapshot.asOf, signalDate)) continue;
    if (best === null || snapshot.asOf > best.asOf) best = snapshot;
  }
  return best;
}
