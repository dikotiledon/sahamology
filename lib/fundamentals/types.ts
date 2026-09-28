/**
 * Phase 3 G5 — the fundamental-health contract.
 *
 * Every name in this file is measured against the live Stockbit payload
 * (`artifacts/keystats-probe-bbri.json`, 2026-09-28). Two findings shape it:
 *
 *   1. The payload is a CURRENT SNAPSHOT. Items are flat `{id, name, value}`
 *      with no fiscal period and no publication date, so there is no period
 *      type to declare. Point-in-time correctness comes from capture time
 *      instead (see `periods.ts`).
 *   2. Metric NAMES are stable: 87 of 98 names appeared for every emiten
 *      measured. That is what makes a name-keyed rubric safe to fail open.
 */

/** The four closed rubric states. `WEAK` is declared but never produced. */
export type FundamentalState = 'SOUND' | 'WEAK' | 'LANDMINE' | 'NOT_EVALUATED';

/** The active G5 profile. Absent is equivalent to `'off'`. */
export type G5Profile = 'off' | 'visible' | 'veto';

/**
 * The ONLY veto clauses.
 *
 * `GOING_CONCERN` and `SERIAL_LOSSES` were designed in the pre-audit plan and
 * are deliberately absent: the payload carries no audit opinion and no
 * per-period series, so both would have been armed-looking, permanently dead
 * branches. Root gate G9 fails the build if either name reappears.
 */
export const VETO_CLAUSES = ['NEGATIVE_EQUITY', 'EXTREME_LEVERAGE', 'DISTRESS_SCORE'] as const;
export type VetoClause = (typeof VETO_CLAUSES)[number];

/** Why the rubric returned the state it returned. Machine keys, English. */
export const FUNDAMENTAL_REASON = {
  NO_KEYSTATS: 'no-keystats',
  FINANCIAL_ISSUER: 'financial-issuer',
  NO_VETO_CLAUSE_FIRED: 'no-veto-clause-fired',
  VETO_CLAUSE_FIRED: 'veto-clause-fired',
} as const;
export type FundamentalReason = (typeof FUNDAMENTAL_REASON)[keyof typeof FUNDAMENTAL_REASON];

/** Metrics the rubric reads, keyed by the endpoint's own name strings. */
export const FINANCIAL_METRIC = {
  TOTAL_EQUITY: 'Total Equity',
  TOTAL_LIABILITIES_EQUITY: 'Total Liabilities/Equity (Quarter)',
  DEBT_TO_EQUITY: 'Debt to Equity Ratio (Quarter)',
  CFO_TTM: 'Cash From Operations (TTM)',
  ROE_TTM: 'Return on Equity (TTM)',
  ALTMAN_Z: 'Altman Z-Score (Modified)',
  PIOTROSKI_F: 'Piotroski F-Score',
} as const;

/**
 * Presence of ANY of these marks a financial issuer.
 *
 * This is the highest-value measurement in the Phase 3 plan. Half the live
 * watchlist is banks, and a naive liabilities/equity clause vetoes every one of
 * them (measured 5/10, a 50% sample collapse that makes the ship gate
 * unreachable by construction). Detected instead by POSITIVE evidence, this
 * separated the 18 probed emitens perfectly: tp=5, fp=0, fn=0, tn=13.
 *
 * The inverse rule ("exclude when no non-bank debt metric is present") is NOT
 * safe: it wrongly excludes BFIN. Only positive evidence is used (D17).
 */
export const FINANCIAL_ISSUER_METRICS = [
  'NPL - Gross',
  'NPL - Coverage',
  'Capital Adequacy Ratio',
  'Loan to Deposit Ratio',
  'CASA Ratio',
  'Cost of Credit',
  'Net Interest Margin (NIM)',
] as const;

/** Rubric thresholds. Frozen in v2 §5.4; every one is measured, not assumed. */
export const FUNDAMENTAL_THRESHOLD = {
  /** Total Equity below zero. */
  NEGATIVE_EQUITY_MAX: 0,
  /** Total Liabilities/Equity above this fires EXTREME_LEVERAGE. */
  EXTREME_LEVERAGE_MIN: 5.0,
  /** Altman Z-Score below zero fires DISTRESS_SCORE. */
  DISTRESS_SCORE_MIN: 0,
} as const;

/** One captured metric, raw text preserved beside the recovered number. */
export interface KeystatsSeriesEntry {
  itemName: string;
  category: string;
  /** The endpoint's value string, verbatim. Never rewritten. */
  valueText: string;
  /** `null` when unavailable or unparseable. NEVER 0 for missing data. */
  valueNum: number | null;
  /** The inline magnitude token, e.g. `'B'`. `null` when absent. */
  scale: string | null;
}

/** The flattened snapshot for one emiten. */
export interface KeystatsSeries {
  emiten: string;
  entries: KeystatsSeriesEntry[];
  isFinancialIssuer: boolean;
  currency: string | null;
}

/** What the evaluator consumes. */
export interface FundamentalInput {
  state: FundamentalState;
  clauses: VetoClause[];
  isFinancialIssuer: boolean;
  reason: FundamentalReason;
}

/** What the card displays. */
export interface FundamentalView extends FundamentalInput {
  g5Profile: G5Profile;
}
