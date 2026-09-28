/**
 * Historical G0–G3 replay: rebuild a PlaybookInput from a persisted
 * stock_queries row so the walk-forward can score the Phase 0 card (system 1)
 * against the Phase 1 card (system 2) on the same universe.
 *
 * Rows missing the book/bandar columns that G1/G2/G3 require are unscored
 * (null), never interpolated with Mix/true defaults — that would fabricate a
 * card that never existed.
 */

import { calculateTargets } from '../calculations';
import { getBrokerInfo } from '../brokers';
import { defaultCostModel } from './costs';
import { isWeekend, isIdxHoliday } from '../market-calendar';
import { parseAccDist } from '../micro/accdist-contract';
import { persistenceTier } from '../micro/persistence';
import { flowState } from '../micro/flow';
import type { BrokerFlowRow } from '../micro/types';
import type { MicroInput, PlaybookInput } from './types';

export interface SignalRow {
  emiten: string;
  from_date: string;
  harga: number;
  ara?: number | null;
  arb: number | null;
  total_bid?: number | null;
  total_offer?: number | null;
  bandar?: string | null;
  barang_bandar?: number | null;
  rata_rata_bandar: number;
  target_realistis: number;
  target_max?: number | null;
  // ---- Phase 2 micro columns (D3). Optional: a pre-Phase-2 row has none. ----
  accdist_overall?: string | null;
  accdist_top1?: string | null;
  accdist_top3?: string | null;
  accdist_top5?: string | null;
  accdist_avg?: string | null;
  broker_total_buyer?: number | null;
  broker_total_seller?: number | null;
  broker_p?: number | null;
  /**
   * D18: true when the capture degraded. A degraded row is UNSCORED for
   * system (3) even if some micro columns happen to be present — the treatment
   * was not uniformly applied, so trusting a partial row would bias the
   * comparison. It is repairable via scripts/repair-captures.ts.
   */
  capture_incomplete?: boolean | null;
}

/**
 * Build the Phase 2 micro view for a historical row, or null when the row
 * cannot support the treatment (D12).
 *
 * Returns null — never a default — when ANY of these hold:
 *  - `accdist_overall` is null/absent (Option D backfill was rejected; the
 *    vendor block only exists prospectively),
 *  - `capture_incomplete` is true (D18: an unrepaired degraded row),
 *  - there is no flow row for the band on that session,
 *  - the band code is absent (G1 would already have blocked).
 *
 * The reporter treats a null here as "unscored for system (3)" while still
 * scoring the row for systems (0)(1)(2), which is what keeps the (2)-vs-(3)
 * comparison honest.
 */
export function buildReplayMicro(
  signal: SignalRow,
  flowWindow: BrokerFlowRow[],
  context?: { bandCode?: string | null; priorBandar?: readonly string[] },
): MicroInput | null {
  const bandCode = (context?.bandCode ?? signal.bandar ?? '').toString().trim();
  if (bandCode === '') return null;
  if (signal.capture_incomplete === true) return null;

  const accdistState = parseAccDist(signal.accdist_overall ?? null);
  // UNKNOWN means the detector returned no usable reading. Replay declines to
  // score such a row at all, so reaching past this guard implies a real
  // reading and `accdistEvaluated` is unconditionally true below. Scored as
  // null (not UNKNOWN) so an unscored row is never charged as a capture
  // success — see §6.1.
  if (accdistState === 'UNKNOWN') return null; // no acc/dist reading at all

  // The decision-time flow reading is the most recent window row. An empty
  // window means no flow was captured for this session.
  const flowRow = flowWindow.length > 0 ? flowWindow[flowWindow.length - 1] : null;
  if (flowRow === null) return null;

  const priorBandar = Array.isArray(context?.priorBandar) ? [...(context!.priorBandar as string[])] : [];
  const tier = persistenceTier(bandCode, priorBandar);

  return {
    bandCode,
    tier,
    accdistState,
    accdistEvaluated: true, // invariant: UNKNOWN already returned null above
    // Replay cannot know whether the broker sold that session unless it was
    // persisted, so the cross-check is `false` (not a distribution verdict).
    // This is deliberately conservative: a replay can only ever produce
    // 'ok' or 'neutral', never 'bad', unless a sellers list is stored.
    flowState: flowState({ tier, row: flowRow, isSeller: false }),
  };
}

/** Build a replay PlaybookInput, or null when required columns are missing. */
export function buildReplayInput(
  signal: SignalRow,
  priorBandar: string[],
  options?: { g1Profile?: 'phase-1' | 'phase-2'; micro?: MicroInput }
): PlaybookInput | null {
  if (
    signal.total_bid === null ||
    signal.total_bid === undefined ||
    !Number.isFinite(signal.total_bid) ||
    signal.total_offer === null ||
    signal.total_offer === undefined ||
    !Number.isFinite(signal.total_offer) ||
    signal.ara === null ||
    signal.ara === undefined ||
    !Number.isFinite(signal.ara) ||
    signal.barang_bandar === null ||
    signal.barang_bandar === undefined ||
    !Number.isFinite(signal.barang_bandar) ||
    signal.arb === null ||
    signal.arb === undefined ||
    !Number.isFinite(signal.arb) ||
    signal.arb <= 0 ||
    signal.bandar === null ||
    signal.bandar === undefined ||
    String(signal.bandar).trim() === ''
  ) {
    return null;
  }

  const bandar = String(signal.bandar).trim();
  const calculated = calculateTargets(
    signal.rata_rata_bandar,
    signal.barang_bandar,
    signal.ara,
    signal.arb,
    signal.total_bid / 100,
    signal.total_offer / 100,
    signal.harga
  );

  // A success row already existed, so the Stockbit token was valid at that
  // time. Session validity is derived from the calendar, not assumed.
  return {
    harga: signal.harga,
    ara: signal.ara,
    arb: signal.arb,
    totalBid: signal.total_bid,
    totalOffer: signal.total_offer,
    bandar,
    barangBandar: signal.barang_bandar,
    rataRataBandar: signal.rata_rata_bandar,
    calculated,
    brokerType: bandar ? getBrokerInfo(bandar).type : 'Mix',
    priorBandar,
    isIdxSession: !isWeekend(signal.from_date) && !isIdxHoliday(signal.from_date),
    tokenValid: true, // persisted success row implies the token was valid
    costs: defaultCostModel(),
    // D1: passed through only when supplied. Omitting them entirely keeps the
    // returned object byte-identical to the Phase 1 shape.
    ...(options?.g1Profile ? { g1Profile: options.g1Profile } : {}),
    ...(options?.micro ? { micro: options.micro } : {}),
  };
}
