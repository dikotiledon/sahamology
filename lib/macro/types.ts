/**
 * Phase 4 G7 — the macro-regime contract.
 *
 * Every name in this file is measured against the live Stockbit payload
 * (`artifacts/macro-probe.json`, recorded 2026-09-28). Three measurements shape
 * it, and two of them are traps this contract exists to close:
 *
 *   1. THERE IS NO `/indices` ROUTE. `/indices`, `/index`, `/market-indices` and
 *      `/global-index` all return HTTP 404 `Unrecognized Command`. The index is
 *      addressed as an ordinary ticker: `/emitten/IHSG/info` → `type_company:
 *      "Index"`. So this phase adds no new integration surface at all.
 *   2. `GOLD` IS NOT A METAL. `/emitten/GOLD/info` returns HTTP 200 and
 *      `type_company: "Saham"` — it resolves to the IDX emiten "Visi
 *      Telekomunikasi Infrastruktur Tbk." A screen that trusted the ticker
 *      name would have read a 272-IDR telecom stock as a gold price and
 *      corrupted every commodity clause. Gold is `XAU`. `GOLD` is therefore
 *      permanently absent from {@link MACRO_SERIES} and the probe records the
 *      exclusion so the trap stays documented rather than merely remembered.
 *   3. `USDIDR` IS THE MARKET RATE, NOT JISDOR. `/emitten/USDIDR/info` returns
 *      `type_company: "FX"`, name "US Dollar / Rupiah". It is an open-market
 *      quote, not Bank Indonesia's published volume-weighted reference rate.
 *      The whole phase therefore names the leg USDIDR and never claims to be
 *      reading JISDOR (plan D1).
 */

/** The four closed regime states. */
export type MacroState = 'SUPPORTIVE' | 'NEUTRAL' | 'CAUTION' | 'NOT_EVALUATED';

/** The active G7 profile. Absent is equivalent to `'off'`. */
export type G7Profile = 'off' | 'visible' | 'veto';

/**
 * The ONLY bar-raising clauses.
 *
 * Names are fixed by the accepted spec §4.2. Each is a CAUTION *label*, not a
 * verdict: it never blocks a trade on its own — that is the `veto` profile's
 * decision, not the classifier's.
 */
export const MACRO_CLAUSES = [
  'USD_IDR_DETERIORATING',
  'IHSG_BROAD_WEAKNESS',
  'SECTOR_COMMODITY_ADVERSE',
] as const;
export type MacroClause = (typeof MACRO_CLAUSES)[number];

/** Why the classifier returned the state it returned. Machine keys, English. */
export const REGIME_REASON = {
  NO_SNAPSHOT: 'no-macro-snapshot',
  SECTOR_UNMAPPED: 'sector-unmapped',
  INSUFFICIENT_HISTORY: 'insufficient-history',
  NO_THRESHOLD_FIRED: 'no-threshold-fired',
  THRESHOLD_FIRED: 'threshold-fired',
} as const;
export type RegimeReason = (typeof REGIME_REASON)[keyof typeof REGIME_REASON];

/**
 * The series each clause reads. Frozen so the classifier, the correlation
 * study and the UI cannot disagree about which leg a clause depends on.
 */
export const CLAUSE_LEG: Record<MacroClause, readonly MacroSeries[]> = {
  USD_IDR_DETERIORATING: ['USDIDR'],
  IHSG_BROAD_WEAKNESS: ['IHSG'],
  SECTOR_COMMODITY_ADVERSE: ['XAU', 'OIL', 'BRENT'],
} as const;

/**
 * The five series this phase may capture.
 *
 * Measured vendor types, from `artifacts/macro-probe.json`:
 *   IHSG   → `Index`       "Index Harga Saham Gabungan"
 *   USDIDR → `FX`          "US Dollar / Rupiah"
 *   XAU    → `commodities` "Gold"            ← the real gold leg
 *   OIL    → `commodities` "Crude Oil"
 *   BRENT  → `commodities` "Brent Oil"
 *
 * `GOLD` is absent by measurement, not by taste. See this file's header.
 */
export const MACRO_SERIES = ['IHSG', 'USDIDR', 'XAU', 'OIL', 'BRENT'] as const;
export type MacroSeries = (typeof MACRO_SERIES)[number];

/** One captured macro bar. Raw vendor values; no verdict is ever stored here. */
export interface MacroBar {
  symbol: MacroSeries;
  /** The bar's trading session, `YYYY-MM-DD`. */
  barDate: string;
  close: number;
  volume: number;
  value: number;
  /** When this row was written, ISO timestamp. Capture time, not session time. */
  capturedAt: string;
}

/** What the evaluator consumes. */
export interface MacroInput {
  state: MacroState;
  clauses: MacroClause[];
  reason: RegimeReason;
  /**
   * Which legs were actually measured for this reading.
   *
   * Recorded so the card can show that a `CAUTION` was reached from a partial
   * read — the same reason `PlaybookCard.micro` exists. A state without this
   * is indistinguishable from a state that saw everything. Spec §4.1.
   */
  evaluated: MacroSeries[];
  /**
   * True when the sector commodity leg was skipped for want of a mapping.
   *
   * Separate from `evaluated` because "we looked and the sector has no
   * commodity exposure" and "we did not look" are different facts, and only one
   * of them is a data gap worth repairing.
   */
  sectorUnmapped: boolean;
}

/** What the card displays. */
export interface MacroView extends MacroInput {
  g7Profile: G7Profile;
}

/**
 * The vendor's hard page-size ceiling.
 *
 * MEASURED 2026-09-28 against the live historical-summary endpoint with the
 * operator's own JWT: `limit=50` returns HTTP 200; `limit=51`, `55`, `60` and
 * `100` each return HTTP 400 `{"error_type":"INVALID_PARAMETER"}`. Reproduced
 * on `IHSG`, `USDIDR`, `XAU` and on `BBCA` as an emiten control, so it is a
 * vendor cap and not a per-symbol quirk.
 *
 * A value one over this ceiling does not degrade — it 400s the whole request,
 * so this is the one constant the pager may never negotiate.
 */
export const MACRO_FETCH_LIMIT = 50;

/**
 * The vendor's hard date-span ceiling, in days.
 *
 * MEASURED 2026-09-28 the same way: a `start_date`…`end_date` window wider
 * than ~365 calendar days returns HTTP 400 `INVALID_PARAMETER` regardless of
 * `limit` or `page`. Deep history is therefore only reachable by stepping
 * backwards in bounded windows, which is what `fetchMacroSeriesPaged` does.
 */
export const MACRO_MAX_SPAN_DAYS = 365;

/**
 * Vendor paging response.
 *
 * Declared here rather than in the capture module so the pager can be tested
 * against a plain object with no HTTP involved.
 */
export interface HistoricalPage {
  /** Rows in vendor order. Callers normalise; the pager never assumes order. */
  rows: HistoricalRow[];
  /** Vendor page cursor, when present. */
  cursor?: string | null;
}

export interface HistoricalRow {
  /** The vendor's own date field, verbatim. Never rewritten before validation. */
  date: string;
  close: number;
  volume: number;
  value: number;
}
