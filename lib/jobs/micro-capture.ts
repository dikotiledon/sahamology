/**
 * Micro capture helpers for the live paths (Phase 2, M12/M13).
 *
 * Two responsibilities, both deliberately narrow:
 *
 *  1. Parse the running-trade chart response for ONE broker — the band's own
 *     code (D4). `pickTopBrokerCodes` returns the top-N by |net value| and the
 *     route caps at 7, so the band's code is not guaranteed to be in the set.
 *     Scoring a different broker's flow as the band's is a category error.
 *
 *  2. Never let a flow failure cost a signal. `captureBandFlow` swallows its
 *     own errors into `row: null` (C10). A 429 costs a coverage point against
 *     D10(6); it must not push the emiten into `errors[]`, and it must not
 *     throw into the signal loop.
 *
 * `buildUpsertPreview` mirrors `lib/db.ts`'s private `buildUpsert` so the D21
 * invariant can be asserted in a test without a database. The test asserts the
 * two writers' payloads differ, which is what keeps a browser query for a
 * job-written date from overwriting the job's micro columns.
 */

import { safeNumber } from '../micro/snapshot';
import type { BrokerFlowRow } from '../micro/types';

/** Mirror of lib/db.ts `buildUpsert`, for assertions. Not used in production paths. */
export function buildUpsertPreview(
  table: string,
  conflict: string,
  data: Record<string, unknown>,
): { text: string; values: unknown[] } {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  const columns = entries.map(([column]) => column);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const updateAssignments = columns
    .filter((column) => column !== conflict.split(',')[0].trim())
    .map((column) => `${column} = EXCLUDED.${column}`);
  return {
    text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflict}) DO UPDATE SET ${updateAssignments.join(', ')}`,
    values,
  };
}

/**
 * Map a `BrokerFlowActivity` (the string-typed UI shape from
 * `lib/broker-flow-transform.ts`) into a numeric row, or null when any required
 * value is missing or non-finite. Never returns a row containing NaN (P2-D).
 */
export function toFlowRow(activity: unknown): BrokerFlowRow | null {
  if (activity === null || activity === undefined || typeof activity !== 'object') return null;
  const a = activity as Record<string, unknown>;

  const netValue = safeNumber(a.net_value);
  const buyDays = safeNumber(a.buy_days);
  const activeDays = safeNumber(a.active_days);
  const consistencyPct = safeNumber(a.consistency_pct);

  if (netValue === null || buyDays === null || activeDays === null || consistencyPct === null) {
    return null;
  }
  return { netValue, buyDays, activeDays, consistencyPct };
}

/**
 * Find the requested broker's activity in a running-trade chart response.
 * Returns null when the broker is absent or the response is malformed.
 */
export function parseFlowActivity(response: unknown, brokerCode: string): BrokerFlowRow | null {
  const code = brokerCode == null ? '' : String(brokerCode).trim();
  if (code === '') return null;
  if (response === null || response === undefined || typeof response !== 'object') return null;

  const data = (response as Record<string, unknown>).data;
  if (!Array.isArray(data)) return null;

  for (const item of data) {
    if (item === null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const candidate = row.broker_code;
    if (candidate == null || String(candidate).trim() !== code) continue;
    return toFlowRow(row);
  }
  return null;
}

export interface BandFlowResult {
  row: BrokerFlowRow | null;
  /** D20: whether the broker appeared in that session's detector listing. */
  brokerSeenInDetector: boolean;
  /** The decision-time window, oldest first. Empty when not fetched. */
  window: BrokerFlowRow[];
}

/**
 * Fetch and map the band's flow for a closed-session window.
 *
 * `fetchFlow` is injected so the test can count calls and simulate a 429
 * without a network or a token. A rejected promise is caught here and
 * degraded to `row: null`; this function never rethrows.
 */
export async function captureBandFlow(args: {
  emiten: string;
  brokerCode: string;
  from: string;
  to: string;
  brokerSeenInDetector: boolean;
  fetchFlow: (emiten: string, brokerCodes: string[], from: string, to: string) => Promise<unknown>;
}): Promise<BandFlowResult> {
  const code = args.brokerCode == null ? '' : String(args.brokerCode).trim();
  if (code === '') return { row: null, brokerSeenInDetector: false, window: [] };

  // D20: a broker that was not in that session's detector is never treated as
  // a real flow reading. A negotiated-board-only or simply-absent broker would
  // otherwise be persisted as a legitimate zero row and later read by D9's
  // net_value<0 rule as distribution.
  if (!args.brokerSeenInDetector) {
    return { row: null, brokerSeenInDetector: false, window: [] };
  }

  try {
    const response = await args.fetchFlow(args.emiten, [code], args.from, args.to);
    const row = parseFlowActivity(response, code);
    return { row, brokerSeenInDetector: true, window: row ? [row] : [] };
  } catch (error) {
    // C10: a flow failure costs a coverage point, never a signal.
    console.error(`[Micro Capture] band flow fetch failed for ${args.emiten}/${code}`, error);
    return { row: null, brokerSeenInDetector: true, window: [] };
  }
}
