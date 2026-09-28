/**
 * The one place where a persisted `keystats_snapshot` row becomes a
 * `KeystatsSeriesEntry`.
 *
 * This is a pure function on purpose. The capture path and the read path both
 * have to turn stored rows into rubric input, and the moment those two mappings
 * are written twice they drift — and a drift here is invisible until it vetoes
 * or fails to veto the wrong company. In particular the financial-issuer flag is
 * derived from entry NAMES, so a row mapping that dropped or renamed an item
 * would silently reclassify a healthy bank as a non-bank and put it straight
 * back through the leverage veto.
 */

import type { KeystatsSeriesEntry } from './types';
import { isFinancialIssuerEntries } from './keystats-series';
import type { ReplayKeystatsSeries } from '../playbook/replay';

/** A stored row, as returned by a `SELECT ... FROM keystats_snapshot` query. */
export interface KeystatsSnapshotRow {
  item_name: unknown;
  category?: unknown;
  value_text?: unknown;
  value_num?: unknown;
  scale?: unknown;
}

/** A whole persisted snapshot, in row form. */
export interface KeystatsSnapshotRows {
  emiten: string;
  asOf: string;
  rows: KeystatsSnapshotRow[];
  /** Report currency as stored at capture time, if any. */
  currency?: string | null;
}

/**
 * NUMERIC columns arrive from `pg` as strings. Parse defensively: a value the
 * driver hands back in a shape we do not recognise must become `null`, never
 * `0`. Coercing an unreadable number to zero is how a real reading silently
 * becomes a fabricated "balanced balance sheet".
 */
export function toNumericOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Map one persisted row into a rubric entry.
 *
 * `category` and `scale` are display metadata and never take part in a verdict,
 * so their nulls are normalised to benign placeholders instead of widening the
 * shared entry type. `valueNum` genuinely must stay nullable — a missing
 * measurement has to remain distinguishable from a measured zero.
 */
export function rowToKeystatsEntry(row: KeystatsSnapshotRow): KeystatsSeriesEntry {
  const itemName = row.item_name == null ? '' : String(row.item_name);
  return {
    itemName,
    category: row.category == null || row.category === '' ? 'unknown' : String(row.category),
    valueText: row.value_text == null ? '' : String(row.value_text),
    valueNum: toNumericOrNull(row.value_num),
    scale: row.scale == null || row.scale === '' ? null : String(row.scale),
  };
}

/**
 * Map a whole persisted snapshot into complete rubric input, in stable name
 * order.
 *
 * The financial-issuer flag is DERIVED here, by the same helper the capture
 * path uses. It is never hard-coded and never carried through storage: a flag
 * persisted once would go stale the moment a company changes sector or a metric
 * is renamed upstream, and a stale flag means a bank judged by a non-bank
 * rubric. Deriving it on both sides from the same function is what makes the
 * two paths agree by construction.
 */
export function rowsToKeystatsSeries(snapshot: KeystatsSnapshotRows): ReplayKeystatsSeries {
  const entries = [...snapshot.rows]
    .map(rowToKeystatsEntry)
    // Sort on the final mapped name so ordering does not depend on the driver.
    .sort((a, b) => (a.itemName < b.itemName ? -1 : a.itemName > b.itemName ? 1 : 0));
  return {
    emiten: snapshot.emiten,
    asOf: snapshot.asOf,
    entries,
    isFinancialIssuer: isFinancialIssuerEntries(entries),
    currency: snapshot.currency ?? null,
  };
}
