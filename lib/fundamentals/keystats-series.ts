/**
 * Phase 3 G5 — KeyStats snapshot parser.
 *
 * PURE. No I/O, no clock, no process.env, no randomness. The display parser
 * `parseKeyStatsResponse` in lib/stockbit.ts is deliberately NOT reused: it
 * flattens to six named category lists for the UI, and this module must not
 * reach into it (leaf-1.1.1 G4).
 *
 * The payload shape is measured, not assumed. From the live probe
 * (artifacts/keystats-probe-bbri.json):
 *
 *   data.closure_fin_items_results  12 categories, ~94 items
 *                                   every item is {id, name, value}
 *   data.financial_report_currency  ["IDR"]
 *   data.financial_year_parent      a market/dividend series, NOT statements
 *
 * Value strings encode BOTH the sign and the magnitude inline, in six
 * observed shapes:
 *
 *   "7.71"           plain
 *   "1,407.43"       thousands separated
 *   "19.02%"         percent
 *   "213,308 B"      inline scale
 *   "(42,295 B)"     parenthesised negative
 *   "-"              unavailable
 *
 * The load-bearing rule is D18: an unavailable value is `null`, never `0`.
 * A `0` would make NEGATIVE_EQUITY and EXTREME_LEVERAGE evaluate false and
 * silently turn missing data into a healthy verdict.
 */

import {
  FINANCIAL_ISSUER_METRICS,
  type KeystatsSeries,
  type KeystatsSeriesEntry,
} from './types';

/** A trailing magnitude token, e.g. the `B` in "213,308 B". */
const SCALE_TOKEN = /\s+([A-Za-z]+)\s*$/;

/** A parenthesised value, e.g. "(42,295 B)". */
const PARENTHESISED = /^\((.*)\)$/;

/** A fully non-numeric string, e.g. the date "21 Apr 26". */
const HAS_DIGIT = /\d/;

export interface ParsedKeyValue {
  /** `null` when unavailable or unparseable. Never `0` for missing data. */
  valueNum: number | null;
  /** The inline magnitude token, or `null`. */
  scale: string | null;
}

/**
 * Recover a number and a scale from a KeyStats value string.
 *
 * Pure and total: it never throws and never returns `NaN` or `Infinity`.
 */
export function parseKeyValue(raw: unknown): ParsedKeyValue {
  const NONE: ParsedKeyValue = { valueNum: null, scale: null };
  if (typeof raw !== 'string') return NONE;

  let text = raw.trim();
  if (text === '' || text === '-') return NONE;

  // Parentheses are the vendor's negative notation, and may wrap the scale
  // token too: "(42,295 B)".
  let negative = false;
  const wrapped = PARENTHESISED.exec(text);
  if (wrapped) {
    negative = true;
    text = (wrapped[1] ?? '').trim();
  }

  // A trailing alphabetic token is the magnitude. "%" is a unit of the value
  // itself, not a magnitude, so it is stripped before this runs.
  let scale: string | null = null;
  if (text.endsWith('%')) {
    text = text.slice(0, -1).trim();
  } else {
    const token = SCALE_TOKEN.exec(text);
    if (token) {
      scale = token[1] ?? null;
      text = text.slice(0, token.index).trim();
    }
  }

  text = text.replace(/,/g, '').trim();
  if (text.startsWith('-')) {
    negative = !negative ? true : negative;
    text = text.slice(1).trim();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim();
  }

  // "21 Apr 26" and friends: a digit alone is not a number.
  if (text === '' || !HAS_DIGIT.test(text)) return NONE;
  if (!/^\d*\.?\d+$/.test(text)) return NONE;

  const value = Number(text);
  if (!Number.isFinite(value)) return NONE;

  return { valueNum: negative ? -value : value, scale };
}

/** One `{id, name, value}` item as the endpoint sends it. */
interface RawItem {
  id?: unknown;
  name?: unknown;
  value?: unknown;
}

interface RawCategory {
  keystats_name?: unknown;
  fin_name_results?: unknown;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Is this a financial issuer? Detected by POSITIVE evidence — the presence of
 * a bank-exclusive regulatory metric.
 *
 * Exported so every reader derives this the SAME way, whoever supplies the
 * entries. The live card reads a raw payload and the API route reads persisted
 * rows, and if those two paths disagreed about whether a company is a bank they
 * would disagree about whether it is vetoable — which is precisely the failure
 * that vetoes healthy banks on a non-bank leverage test.
 */
export function isFinancialIssuerEntries(
  entries: ReadonlyArray<{ itemName: string }>,
): boolean {
  const names = new Set(entries.map((entry) => entry.itemName));
  return FINANCIAL_ISSUER_METRICS.some((metric) => names.has(metric));
}

/**
 * Flatten the payload into one entry per item, tagged with its category.
 *
 * Never throws. A malformed category contributes nothing; a malformed item
 * contributes a `null`-valued entry only when it has a usable name.
 */
export function parseKeyStatsSeries(json: unknown, emiten: string): KeystatsSeries {
  const entries: KeystatsSeriesEntry[] = [];

  const data = (json ?? {}) as { data?: unknown };
  const root = (data.data ?? {}) as {
    closure_fin_items_results?: unknown;
    financial_report_currency?: unknown;
  };

  for (const rawCategory of asArray(root.closure_fin_items_results)) {
    const category = (rawCategory ?? {}) as RawCategory;
    const categoryName =
      typeof category.keystats_name === 'string' ? category.keystats_name : 'unknown';

    for (const rawResult of asArray(category.fin_name_results)) {
      const result = (rawResult ?? {}) as { fitem?: unknown };
      const item = (result.fitem ?? {}) as RawItem;
      if (typeof item.name !== 'string' || item.name === '') continue;

      const { valueNum, scale } = parseKeyValue(item.value);
      entries.push({
        itemName: item.name,
        category: categoryName,
        valueText: typeof item.value === 'string' ? item.value : '',
        valueNum,
        scale,
      });
    }
  }

  const isFinancialIssuer = isFinancialIssuerEntries(entries);

  const currencyList = asArray(root.financial_report_currency);
  const currency =
    typeof currencyList[0] === 'string' ? (currencyList[0] as string) : null;

  return { emiten, entries, isFinancialIssuer, currency };
}
