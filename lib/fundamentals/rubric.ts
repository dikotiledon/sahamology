/**
 * Phase 3 G5 — the fundamental-health rubric.
 *
 * PURE and total. No I/O, no clock, no `process.env`, no vendor fetch, no
 * randomness. The same snapshot always yields the same verdict, which is what
 * makes a replay reproducible and an audit possible.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CLAUSE SET IS THIS SMALL
 *
 * The pre-audit plan proposed five veto clauses. Two were deleted because the
 * live feed cannot measure them:
 *
 *   GOING_CONCERN  — needs an audit opinion. The payload has no text field of
 *                    any kind. It would have been an armed-looking branch that
 *                    could never fire.
 *   SERIAL_LOSSES  — needs three consecutive annual periods. The payload is a
 *                    current snapshot with no period dimension at all.
 *
 * A veto clause that cannot fire is worse than no clause: it inflates the
 * apparent rigour of the gate while contributing nothing. What remains are
 * three clauses, each backed by a metric confirmed present across every probed
 * emiten.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BANK EXCLUSION IS LOAD-BEARING
 *
 * Half the live watchlist is commercial banks. Leverage means something
 * different for them — deposits are inventory, not debt — and the measured
 * numbers prove it: liabilities/equity is 5.14 (BBCA), 7.89 (BBNI), 7.85
 * (BMRI) and 13.52 (BBTN). A naive threshold vetoes four of them, which is a
 * 50% sample collapse that would make the ship gate unreachable by
 * construction rather than by evidence.
 *
 * Issuers are detected by POSITIVE evidence — the presence of a bank-exclusive
 * regulatory metric — never by "looks financial". Across the 26 probed
 * emitens that rule separated perfectly: 5 banks caught, 0 false positives.
 * The inverse rule is not safe: it would exclude BFIN, a genuine non-bank.
 *
 * ---------------------------------------------------------------------------
 * THE FAIL-OPEN DIRECTION
 *
 * Every unmeasured input degrades to `NOT_EVALUATED`, never to `LANDMINE`.
 * G5 may withhold a trade; it must never invent a reason to skip one. A veto
 * that fires on absent data is strictly worse than no veto, because it is
 * indistinguishable from a real finding.
 */

import {
  FUNDAMENTAL_REASON,
  FUNDAMENTAL_THRESHOLD,
  type FundamentalInput,
  type KeystatsSeries,
  type VetoClause,
} from './types';

/** The ONLY veto clauses. Frozen; root gate G9 fails the build on any change. */
export const VETO_CLAUSES = ['NEGATIVE_EQUITY', 'EXTREME_LEVERAGE', 'DISTRESS_SCORE'] as const;

/** Lookup by the endpoint's own item names. */
const METRIC = {
  TOTAL_EQUITY: 'Total Equity',
  TOTAL_LIABILITIES_EQUITY: 'Total Liabilities/Equity (Quarter)',
  DEBT_TO_EQUITY: 'Debt to Equity Ratio (Quarter)',
  ALTMAN_Z: 'Altman Z-Score (Modified)',
} as const;

/** Read a single metric. Returns `null` for absent, unparseable or non-finite. */
function readMetric(series: KeystatsSeries, itemName: string): number | null {
  const entry = series.entries.find((e) => e.itemName === itemName);
  if (!entry) return null;
  const value = entry.valueNum;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** True only when at least one veto input is actually measurable. */
function hasAnyMeasurement(series: KeystatsSeries): boolean {
  return Object.values(METRIC).some((name) => readMetric(series, name) !== null);
}

/**
 * Classify a captured KeyStats snapshot.
 *
 * Never throws. A `null`, `undefined` or structurally broken input returns
 * `NOT_EVALUATED` with reason `no-keystats`.
 */
export function classifyFundamentals(snapshot: KeystatsSeries | null | undefined): FundamentalInput {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.entries)) {
    return {
      state: 'NOT_EVALUATED',
      clauses: [],
      isFinancialIssuer: false,
      reason: FUNDAMENTAL_REASON.NO_KEYSTATS,
    };
  }

  const isFinancialIssuer = snapshot.isFinancialIssuer === true;

  // A financial issuer is OUT OF SCOPE for the non-bank solvency tests, not
  // thereby healthy. The state is NOT_EVALUATED so no veto is ever recorded,
  // and the reason is explicit so the card can say why.
  if (isFinancialIssuer) {
    return {
      state: 'NOT_EVALUATED',
      clauses: [],
      isFinancialIssuer: true,
      reason: FUNDAMENTAL_REASON.FINANCIAL_ISSUER,
    };
  }

  const equity = readMetric(snapshot, METRIC.TOTAL_EQUITY);
  const liabilitiesEquity = readMetric(snapshot, METRIC.TOTAL_LIABILITIES_EQUITY);
  const debtEquity = readMetric(snapshot, METRIC.DEBT_TO_EQUITY);
  const altmanZ = readMetric(snapshot, METRIC.ALTMAN_Z);

  // Nothing measurable means no opinion. This check comes BEFORE any clause
  // so a payload of all-dashes can never be argued into a veto.
  if (!hasAnyMeasurement(snapshot)) {
    return {
      state: 'NOT_EVALUATED',
      clauses: [],
      isFinancialIssuer: false,
      reason: FUNDAMENTAL_REASON.NO_KEYSTATS,
    };
  }

  const fired: VetoClause[] = [];

  if (equity !== null && equity < FUNDAMENTAL_THRESHOLD.NEGATIVE_EQUITY_MAX) {
    fired.push('NEGATIVE_EQUITY');
  }

  const leverageExcess =
    liabilitiesEquity !== null && liabilitiesEquity > FUNDAMENTAL_THRESHOLD.EXTREME_LEVERAGE_MIN;
  const debtEquityExcess =
    debtEquity !== null && debtEquity > FUNDAMENTAL_THRESHOLD.EXTREME_LEVERAGE_MIN;
  if (leverageExcess || debtEquityExcess) {
    fired.push('EXTREME_LEVERAGE');
  }

  if (altmanZ !== null && altmanZ < FUNDAMENTAL_THRESHOLD.DISTRESS_SCORE_MIN) {
    fired.push('DISTRESS_SCORE');
  }

  if (fired.length > 0) {
    return {
      state: 'LANDMINE',
      clauses: fired,
      isFinancialIssuer: false,
      reason: FUNDAMENTAL_REASON.VETO_CLAUSE_FIRED,
    };
  }

  return {
    state: 'SOUND',
    clauses: [],
    isFinancialIssuer: false,
    reason: FUNDAMENTAL_REASON.NO_VETO_CLAUSE_FIRED,
  };
}
