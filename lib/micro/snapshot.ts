/**
 * Micro snapshot mapper (Phase 2, M4).
 *
 * A PURE mapper from already-fetched responses. It never fetches, never
 * throws, and never invents a value. Every uncertain input degrades to an
 * explicit `null`, which the contracts read as UNKNOWN / NOT_EVALUATED and the
 * ship gate counts as a coverage miss.
 *
 * Three failure modes this file exists to prevent:
 *
 *  1. A `NaN` reaching a stored column. `lib/broker-flow-transform.ts` builds
 *     its UI payload with `String(...)`, so a bad upstream number arrives as
 *     the literal string "NaN". `safeNumber` is the only way a numeric enters
 *     a snapshot, and it returns null rather than NaN (P2-D).
 *
 *  2. A malformed detector response throwing into the signal loop and losing
 *     a signal. Every read is defensive; a whole response of `null`,
 *     `'nonsense'`, or `42` still yields a snapshot.
 *
 *  3. A missing capture being invisible. `captureIncomplete` (D18) is set
 *     whenever a micro input is absent, so `scripts/repair-captures.ts` can
 *     repair the row. Without it the capture guard treats the session as
 *     captured and the signal is permanently unscored for system (3).
 */

import { parseAccDist } from './accdist-contract';
import { persistenceTier } from './persistence';
import { flowState } from './flow';
import type { BrokerFlowRow, MicroRaw, MicroSnapshot, PersistenceTier } from './types';
import type { MarketDetectorResponse } from '../types';

/**
 * Parse anything into a finite number, or null. Never returns NaN.
 * This is the ONLY numeric entry point in the micro layer.
 */
export function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'object') return null; // Number({}) is NaN, but be explicit

  // Trim BEFORE coercing. `Number('')` and `Number('  ')` are both 0, which
  // would store a fabricated zero in a NUMERIC column for an empty vendor
  // string — the exact P2-D failure this function exists to prevent.
  if (typeof value === 'string' && value.trim() === '') return null;

  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n)) return null; // covers NaN, Infinity, "NaN", "abc"
  return n;
}

/** Read a possibly-absent nested object without throwing. */
function obj(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Read a string field, preserving the vendor value verbatim (including '-'). */
function str(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Was the band's code among that session's sellers?
 *
 * true  — exact code match in `brokers_sell`
 * false — the list is present and the code is absent
 * null  — the list is absent, or there is no band code
 *
 * null is load-bearing: `flowState` only returns 'bad' when this is exactly
 * `true`, so an absent list can never manufacture a distribution verdict
 * (D9). D20 makes the same check structural at the write.
 */
export function isBandarSellerOn(
  marketDetector: MarketDetectorResponse | null | undefined,
  bandCode: string | null | undefined,
): boolean | null {
  const code = bandCode == null ? '' : String(bandCode).trim();
  if (code === '') return null;

  const data = obj(obj(marketDetector)?.data);
  const summary = obj(data?.broker_summary);
  const sellers = summary?.brokers_sell;
  if (!Array.isArray(sellers)) return null; // list absent → absence of evidence

  return sellers.some((s) => {
    const row = obj(s);
    const c = row ? str(row.netbs_broker_code) : null;
    return c != null && c.trim() === code;
  });
}

/** Map the `bandar_detector` block into raw values, or null when absent/malformed. */
function mapRaw(marketDetector: MarketDetectorResponse | null | undefined): MicroRaw | null {
  const data = obj(obj(marketDetector)?.data);
  const det = obj(data?.bandar_detector);
  if (!det) return null;

  const stat = (key: string): string | null => {
    const s = obj(det[key]);
    return s ? str(s.accdist) : null;
  };

  return {
    accdistOverall: str(det.broker_accdist),
    accdistTop1: stat('top1'),
    accdistTop3: stat('top3'),
    accdistTop5: stat('top5'),
    accdistAvg: stat('avg'),
    brokerTotalBuyer: safeNumber(det.total_buyer),
    brokerTotalSeller: safeNumber(det.total_seller),
    brokerP: null, // filled by the caller: `p` is an Adi field, not a detector field
  };
}

export function buildMicroSnapshot(args: {
  marketDetector: MarketDetectorResponse | null | undefined;
  bandCode: string | null | undefined;
  priorBandar: readonly string[] | null | undefined;
  flowRow: BrokerFlowRow | null | undefined;
  isSeller: boolean | null | undefined;
  flowWindow: readonly BrokerFlowRow[] | null | undefined;
  brokerP?: number | null;
}): MicroSnapshot {
  const raw = mapRaw(args.marketDetector);
  if (raw && args.brokerP !== undefined) raw.brokerP = safeNumber(args.brokerP);

  const bandCode = args.bandCode == null ? '' : String(args.bandCode).trim();
  const band = bandCode === '' ? null : bandCode;
  const prior = Array.isArray(args.priorBandar) ? args.priorBandar.filter((c): c is string => typeof c === 'string') : [];
  const row = args.flowRow ?? null;
  const window = Array.isArray(args.flowWindow) ? [...args.flowWindow] : [];

  const tier: PersistenceTier | null = persistenceTier(band, prior);

  return {
    raw,
    flow: row,
    flowIsSeller: args.isSeller ?? null,
    flowWindow: window,
    bandCode: band,
    priorBandar: prior,
    tier,
    accdistState: parseAccDist(raw?.accdistOverall ?? null),
    flowState: flowState({ tier, row, isSeller: args.isSeller ?? null }),
    // D18: any missing micro input makes the row repairable rather than final.
    captureIncomplete: raw === null || row === null,
  };
}
