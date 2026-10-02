/**
 * Micro capture helpers for the live paths (Phase 2, M12/M13 & Phase 7 Insider Radar).
 *
 * Responsibilities:
 *
 *  1. Parse running-trade chart responses for the band's own code (D4) and
 *     multi-broker universe flow (Phase 7).
 *
 *  2. Never let a flow failure cost a signal. `captureBandFlow` and
 *     `captureUniverseBrokerFlow` swallow errors into `row: null` / empty maps.
 *     A 429 costs a coverage point against D10(6); it must not push the emiten
 *     into `errors[]`, and it must not throw into the signal loop.
 *
 * `buildUpsertPreview` mirrors `lib/db.ts`'s private `buildUpsert` so the D21
 * invariant can be asserted in a test without a database.
 */

import { safeNumber } from '../micro/snapshot';
import type { BrokerFlowRow } from '../micro/types';
import type { RunningTradeChartData } from '../types';
import { transformRunningTradeChartToBrokerFlow } from '../broker-flow-transform';

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
 * Handles both the legacy array mock format and live Stockbit RunningTradeChartData.
 * Returns null when the broker is absent or the response is malformed.
 */
export function parseFlowActivity(
  response: unknown,
  brokerCode: string,
  emiten: string = ''
): BrokerFlowRow | null {
  const code = brokerCode == null ? '' : String(brokerCode).trim().toUpperCase();
  if (code === '') return null;
  if (response === null || response === undefined || typeof response !== 'object') return null;

  const data = (response as Record<string, unknown>).data;
  if (!data) return null;

  // Case 1: Array of activities (mock or intermediate format)
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item === null || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const candidate = row.broker_code;
      if (candidate == null || String(candidate).trim().toUpperCase() !== code) continue;
      return toFlowRow(row);
    }
    return null;
  }

  // Case 2: Live Stockbit RunningTradeChartData format
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;

    // Subcase 2a: Already transformed with activities
    if (Array.isArray(obj.activities)) {
      for (const item of obj.activities) {
        if (item === null || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const candidate = row.broker_code;
        if (candidate == null || String(candidate).trim().toUpperCase() !== code) continue;
        return toFlowRow(row);
      }
    }

    // Subcase 2b: Raw broker_chart_data from Exodus Stockbit API
    if (Array.isArray(obj.broker_chart_data)) {
      try {
        const transformed = transformRunningTradeChartToBrokerFlow(
          obj as unknown as RunningTradeChartData,
          emiten
        );
        for (const act of transformed.activities) {
          if (act.broker_code && act.broker_code.trim().toUpperCase() === code) {
            return toFlowRow(act);
          }
        }
      } catch (err) {
        console.error('[Micro Capture] Error transforming running trade chart data:', err);
      }
    }
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
  const code = args.brokerCode == null ? '' : String(args.brokerCode).trim().toUpperCase();
  if (code === '') return { row: null, brokerSeenInDetector: false, window: [] };

  // D20: a broker that was not in that session's detector is never treated as
  // a real flow reading.
  if (!args.brokerSeenInDetector) {
    return { row: null, brokerSeenInDetector: false, window: [] };
  }

  try {
    const response = await args.fetchFlow(args.emiten, [code], args.from, args.to);
    const row = parseFlowActivity(response, code, args.emiten);
    return { row, brokerSeenInDetector: true, window: row ? [row] : [] };
  } catch (error) {
    console.error(`[Micro Capture] band flow fetch failed for ${args.emiten}/${code}`, error);
    return { row: null, brokerSeenInDetector: true, window: [] };
  }
}

export interface UniverseBrokerFlowResult {
  rows: Map<string, BrokerFlowRow>;
  rawResponse?: unknown;
}

/** Maximum broker codes Stockbit accepts per running-trade chart request */
export const MAX_RUNNING_TRADE_BROKERS_PER_REQUEST = 7;

/**
 * Batch fetch and parse running-trade flow for multiple broker codes.
 * Persists top detector broker flows for Phase 7 Insider Radar.
 * Chunks codes into batches of <= 7 to respect Stockbit's upstream limit.
 * Never throws — returns empty map on failure.
 */
export async function captureUniverseBrokerFlow(args: {
  emiten: string;
  brokerCodes: string[];
  from: string;
  to: string;
  fetchFlow: (emiten: string, brokerCodes: string[], from: string, to: string) => Promise<unknown>;
}): Promise<UniverseBrokerFlowResult> {
  const codes = (args.brokerCodes || [])
    .map((c) => String(c).trim().toUpperCase())
    .filter(Boolean);

  if (codes.length === 0) {
    return { rows: new Map() };
  }

  const rows = new Map<string, BrokerFlowRow>();
  let lastRawResponse: unknown = undefined;

  // Chunk codes into batches of at most 7
  for (let i = 0; i < codes.length; i += MAX_RUNNING_TRADE_BROKERS_PER_REQUEST) {
    const chunk = codes.slice(i, i + MAX_RUNNING_TRADE_BROKERS_PER_REQUEST);
    try {
      const response = await args.fetchFlow(args.emiten, chunk, args.from, args.to);
      lastRawResponse = response;
      for (const code of chunk) {
        const row = parseFlowActivity(response, code, args.emiten);
        if (row) {
          rows.set(code, row);
        }
      }
    } catch (error) {
      console.error(
        `[Micro Capture] universe broker flow fetch failed for ${args.emiten} (chunk ${chunk.join(',')}):`,
        error
      );
    }
  }

  return { rows, rawResponse: lastRawResponse };
}
