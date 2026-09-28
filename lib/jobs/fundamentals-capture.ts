/**
 * Phase 3 G5 — the daily fundamentals capture.
 *
 * One KeyStats fetch per emiten per run (D12), persisted to `keystats_snapshot`
 * as RAW items. No verdict is computed here: the rubric runs at read time (D7),
 * so a threshold or bank-rule fix re-scores history without a backfill.
 *
 * The governing property is D11 — a failure here must never cost a signal.
 * G5 fails OPEN, so a missing fundamental read downgrades a signal to
 * NOT_EVALUATED and leaves the trade decision untouched. If a 429 could throw
 * into the job's signal loop or land on its error list, one transient rate
 * limit would delete a sample from the walk-forward denominator, silently and
 * in exactly the direction that flatters results. So every path here degrades
 * to `incomplete: true` and returns; nothing propagates.
 *
 * `fetchKeyStatsRaw` and `saveSnapshot` are injected so this is testable with
 * no network, no token and no database.
 */

import { parseKeyStatsSeries } from '../fundamentals/keystats-series';
import type { KeystatsSeriesEntry } from '../fundamentals/types';

/** One row destined for `keystats_snapshot`. */
export interface KeystatsSnapshotRow {
  emiten: string;
  /** `YYYY-MM-DD` capture date — the point-in-time key. */
  asOf: string;
  itemName: string;
  category: string | null;
  /** The vendor's value string, verbatim. */
  valueText: string | null;
  /** `null` means "the vendor gave no number". NEVER 0 for missing data. */
  valueNum: number | null;
  scale: string | null;
  currency: string | null;
}

export interface CaptureResult {
  emiten: string;
  ok: boolean;
  /** Set when the signal must be marked `fundamentals_incomplete` for repair. */
  incomplete: boolean;
  rowCount: number;
  error?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Flatten a raw KeyStats payload into persistable entries plus the report
 * currency, which lives beside the items rather than on them.
 *
 * Never throws. A malformed payload yields an empty list, which the caller
 * treats as a capture failure rather than a clean "no data".
 */
export function toSnapshotEntries(
  payload: unknown,
  emiten: string,
): { entries: KeystatsSeriesEntry[]; currency: string | null } {
  const parsed = parseKeyStatsSeries(payload, emiten);
  const entries = parsed.entries.map((entry) => ({
    ...entry,
    // Belt and braces: a non-finite number must never reach a NUMERIC column.
    valueNum:
      typeof entry.valueNum === 'number' && Number.isFinite(entry.valueNum)
        ? entry.valueNum
        : null,
  }));
  return { entries, currency: parsed.currency };
}

/**
 * Bind entries to a capture date, ready to persist.
 *
 * De-duplicates by `item_name` because it is part of the primary key: a
 * repeated item in one payload would otherwise raise a constraint violation
 * and fail the whole capture, losing ~93 good rows to one duplicate.
 */
export function buildKeystatsSnapshotRows(
  entries: KeystatsSeriesEntry[],
  asOf: string,
  emiten: string,
  currency: string | null = null,
): KeystatsSnapshotRow[] {
  if (!ISO_DATE.test(asOf)) return [];
  const key = emiten.trim().toUpperCase();

  const seen = new Set<string>();
  const rows: KeystatsSnapshotRow[] = [];
  for (const entry of entries) {
    if (seen.has(entry.itemName)) continue;
    seen.add(entry.itemName);
    rows.push({
      emiten: key,
      asOf,
      itemName: entry.itemName,
      category: entry.category || null,
      valueText: entry.valueText || null,
      valueNum: entry.valueNum,
      scale: entry.scale,
      currency,
    });
  }
  return rows;
}

/**
 * Fetch and persist one emiten's KeyStats snapshot.
 *
 * Exactly one vendor call (D12). Never throws: every failure becomes
 * `incomplete: true` so the caller can flag the row for the repair pass.
 */
export async function captureFundamentals(args: {
  emiten: string;
  asOf: string;
  fetchKeyStatsRaw: (emiten: string) => Promise<unknown>;
  saveSnapshot: (rows: KeystatsSnapshotRow[]) => Promise<unknown>;
}): Promise<CaptureResult> {
  const emiten = String(args.emiten ?? '').trim().toUpperCase();
  const base: CaptureResult = { emiten, ok: false, incomplete: true, rowCount: 0 };

  if (emiten === '' || !ISO_DATE.test(args.asOf)) {
    return { ...base, error: 'invalid capture arguments' };
  }

  let entries: KeystatsSeriesEntry[];
  let currency: string | null;
  try {
    const payload = await args.fetchKeyStatsRaw(emiten);
    ({ entries, currency } = toSnapshotEntries(payload, emiten));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Fundamentals Capture] fetch failed for ${emiten}: ${message}`);
    return { ...base, error: message };
  }

  const rows = buildKeystatsSnapshotRows(entries, args.asOf, emiten, currency);

  // A 200 carrying no items is a capture failure, not a clean absence. Treating
  // it as success would leave the signal permanently unscored AND unrepairable.
  if (rows.length === 0) {
    return { ...base, error: 'payload carried no usable items' };
  }

  try {
    await args.saveSnapshot(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Fundamentals Capture] save failed for ${emiten}: ${message}`);
    return { ...base, error: message };
  }

  return { emiten, ok: true, incomplete: false, rowCount: rows.length };
}
