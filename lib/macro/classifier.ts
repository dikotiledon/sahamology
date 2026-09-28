/**
 * Phase 4 G7 — the pure regime classifier.
 *
 * PURE. No clock, no database, no network, no `process.env`. Root gate G2 and
 * leaf gate 1.2.1:G2 assert all four by inspecting the source, and the reason
 * they bother is that this function decides whether a trade is held back. A
 * classifier that could read the wall clock would classify a replay differently
 * than it classified the live day, and a backtest built on that difference is
 * fiction.
 *
 * THE MATH (accepted spec §4.2), unchanged:
 *
 *     z = (x_t - mean(x_{t-W..t-1})) / stdev(x_{t-W..t-1})
 *
 * with `W = REGIME_THRESHOLD.WINDOW` sessions, and the trailing window
 * STRICTLY `< t`. A bar may not appear in its own baseline: including it would
 * shrink the very deviation the clause is measuring, so a genuine break would
 * under-report and a quiet day would look like a signal.
 *
 * FAIL-OPEN IS THE POINT (D4/D5). Every input that cannot be measured produces
 * `NOT_EVALUATED` with a reason key — never a neutral pass, never a block, and
 * never a default threshold. The thresholds themselves are NOT defined here:
 * they are measured in leaf 1.2.2 and carry a `measuredFrom` provenance token.
 * Until that study populates them, a clause has no bound and therefore cannot
 * fire, so a half-measured phase reports `NOT_EVALUATED` rather than inventing
 * a number that would look rigorous and mean nothing.
 */

import {
  MACRO_CLAUSES,
  REGIME_REASON,
  type MacroClause,
  type MacroInput,
  type MacroSeries,
  type RegimeReason,
} from './types';

/** The trailing-window length, in sessions. Fixed by the accepted spec. */
export const REGIME_WINDOW = 20;

/**
 * Frozen clause bounds, with the capture that produced each one.
 *
 * Every bound is MEASURED, never assumed. `measuredFrom` is not documentation —
 * it is the contract: leaf 1.2.2:G2 fails the build if a bound is present
 * without a non-empty provenance token, because an unmeasured number in this
 * position looks identical to a measured one and would silently arm a clause
 * on nothing.
 *
 * These are deliberately `null` until leaf 1.2.2 publishes real numbers. A
 * `null` bound means the clause CANNOT FIRE, which is the honest state while
 * unmeasured — the opposite of a default like "2 sigma" that would arm all
 * three clauses on nothing.
 */
export interface RegimeThreshold {
  /** The trailing-z bound at or beyond which the clause fires. */
  bound: number | null;
  /** Names the capture + artifact that produced `bound`. Required when set. */
  measuredFrom: string | null;
  /** Which way is adverse for this clause: -1 when a LOW z is the warning. */
  direction: 1 | -1;
}

export const REGIME_THRESHOLD: Record<MacroClause, RegimeThreshold> = {
  // A rupiah that is unusually WEAK trades at a HIGH USDIDR, so the adverse
  // direction is +1. (The feed is the market USD/IDR rate, not JISDOR — D1.)
  USD_IDR_DETERIORATING: { bound: null, measuredFrom: null, direction: 1 },
  // IHSG weakness is a LOW z.
  IHSG_BROAD_WEAKNESS: { bound: null, measuredFrom: null, direction: -1 },
  // Commodity headwind is a HIGH z for the sector's input commodity.
  SECTOR_COMMODITY_ADVERSE: { bound: null, measuredFrom: null, direction: 1 },
};

/** One series' worth of closes, oldest first, as stored in `macro_snapshot`. */
export interface SeriesBars {
  symbol: MacroSeries;
  /** Closes oldest-first. The LAST element is the bar at `t`. */
  closes: number[];
}

export interface ClassifyInput {
  /** Bars per leg, oldest first. A leg absent here is simply not evaluated. */
  series: readonly SeriesBars[];
  /**
   * The emiten's sector, or `null` when unknown.
   *
   * `null` means the commodity leg is skipped with `sectorUnmapped: true` — a
   * known gap, distinct from a sector that genuinely has no commodity
   * exposure.
   */
  sector: string | null;
  /** The commodity legs this sector is actually exposed to. */
  sectorCommodityLegs?: readonly MacroSeries[];
  /** Frozen bounds. Defaults to {@link REGIME_THRESHOLD}. */
  thresholds?: Record<MacroClause, RegimeThreshold>;
}

/**
 * Population stdev over the given sample, or `null` when it cannot be computed.
 *
 * Population (divide by n), not sample (n-1): the window is the whole baseline,
 * not a draw from a larger one, and the frozen bounds were measured the same
 * way. Mixing the two would make a published bound mean something slightly
 * different here than it did in the study that produced it.
 *
 * A zero stdev returns `null` rather than `Infinity`. A perfectly flat window
 * means the ratio below is undefined — dividing by zero would yield `Infinity`
 * or `NaN`, and an `Infinity` z compares "at or beyond any bound", so a dead
 * series would fire every clause it appears in.
 */
export function populationStdev(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  return sd > 0 ? sd : null;
}

/**
 * The trailing z-score of the last bar against the STRICTLY PRIOR window.
 *
 * `bars` is oldest-first and the final element is `t`. The baseline is
 * `bars.slice(0, -1)` — the current bar is excluded by construction rather
 * than by convention, so a caller cannot accidentally include it.
 *
 * Returns `null` when there are fewer than `window` prior bars, or when the
 * prior window has no dispersion. Both are "cannot measure", never "zero".
 */
export function trailingZScore(
  bars: readonly number[],
  window: number = REGIME_WINDOW,
): number | null {
  // STRICTLY PRIOR. The current bar must not be in its own baseline.
  const prior = bars.slice(0, -1);
  if (prior.length < window) return null;
  const baseline = prior.slice(-window);
  const current = bars[bars.length - 1];
  if (!Number.isFinite(current)) return null;

  const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
  const sd = populationStdev(baseline);
  if (sd === null) return null;
  return (current - mean) / sd;
}

/** Does this clause fire, given a measured z and its bound? */
const clauseFires = (z: number, threshold: RegimeThreshold): boolean => {
  if (threshold.bound === null || threshold.measuredFrom === null || threshold.measuredFrom === '') {
    // Unmeasured: the clause cannot fire. Failing open here is the whole
    // design — a half-measured phase must not raise the bar on a guess.
    return false;
  }
  return threshold.direction === 1 ? z >= threshold.bound : z <= -threshold.bound;
};

const notEvaluated = (reason: RegimeReason, evaluated: MacroSeries[]): MacroInput => ({
  state: 'NOT_EVALUATED',
  clauses: [],
  reason,
  evaluated,
  sectorUnmapped: reason === REGIME_REASON.SECTOR_UNMAPPED,
});

/**
 * Classify the macro regime from stored bars.
 *
 * Never throws and never returns a partial read as a pass. Precedence:
 *   no bars at all            -> NO_SNAPSHOT
 *   any leg under the window  -> INSUFFICIENT_HISTORY
 *   no clause fired           -> NEUTRAL
 *   at least one fired        -> CAUTION
 *
 * `SUPPORTIVE` is declared but NOT produced here. Claiming the macro backdrop
 * is supportive would be a stronger claim than the measured data supports: the
 * study measures whether an adverse regime predicts a worse forward result,
 * not that a calm one predicts a better one. A state that is merely un-flagged
 * is `NEUTRAL`, and saying so is what keeps the card honest.
 */
export function classifyRegime(input: ClassifyInput): MacroInput {
  const thresholds = input.thresholds ?? REGIME_THRESHOLD;
  const bySymbol = new Map<MacroSeries, number[]>();
  for (const entry of input.series) {
    bySymbol.set(entry.symbol, entry.closes);
  }

  const evaluated: MacroSeries[] = [];
  const insufficient: MacroSeries[] = [];
  const fired: MacroClause[] = [];
  let sectorGap = false;
  /**
   * A leg that is APPLICABLE but whose bars were never captured at all, as
   * opposed to captured-but-too-short. This is the difference between "the
   * capture never ran" and "the capture ran and there was not enough history
   * yet" — two different operational problems with two different repairs, so
   * they get two different reason keys.
   */
  const absent: MacroSeries[] = [];

  const legFor: Record<MacroClause, MacroSeries> = {
    USD_IDR_DETERIORATING: 'USDIDR',
    IHSG_BROAD_WEAKNESS: 'IHSG',
    SECTOR_COMMODITY_ADVERSE: 'XAU',
  };

  for (const clause of MACRO_CLAUSES) {
    const symbol = legFor[clause];
    const closes = bySymbol.get(symbol);

    if (clause === 'SECTOR_COMMODITY_ADVERSE') {
      const legs = input.sectorCommodityLegs ?? [];
      if (input.sector === null || legs.length === 0) {
        // A known, recorded gap, NOT a reason to discard the other two legs.
        //
        // Returning here would make NO_SNAPSHOT and INSUFFICIENT_HISTORY
        // unreachable for any stock whose sector has no commodity mapping —
        // and a bank-heavy watchlist is mostly such stocks. The leg is simply
        // skipped, `sectorUnmapped` records why, and the remaining clauses are
        // still measured.
        sectorGap = true;
        continue;
      }
      // Evaluate the sector's own legs; any one of them firing is the clause.
      let anyInsufficient = false;
      let anyFired = false;
      for (const leg of legs) {
        const legCloses = bySymbol.get(leg);
        if (!legCloses || legCloses.length === 0) {
          // Applicable, but nothing was ever captured for it.
          anyInsufficient = true;
          if (!absent.includes(leg)) absent.push(leg);
          continue;
        }
        const z = trailingZScore(legCloses, REGIME_WINDOW);
        if (z === null) {
          // Captured, but not enough of it. Distinct from `absent`.
          anyInsufficient = true;
          continue;
        }
        if (!evaluated.includes(leg)) evaluated.push(leg);
        if (clauseFires(z, thresholds[clause])) anyFired = true;
      }
      if (anyInsufficient && !anyFired) {
        insufficient.push(...legs);
        continue;
      }
      if (anyFired) fired.push(clause);
      continue;
    }

    if (!closes || closes.length === 0) {
      // Absent, not short. Recorded so NO_SNAPSHOT stays reachable.
      absent.push(symbol);
      continue;
    }
    const z = trailingZScore(closes, REGIME_WINDOW);
    if (z === null) {
      insufficient.push(symbol);
      continue;
    }
    if (!evaluated.includes(symbol)) evaluated.push(symbol);
    if (clauseFires(z, thresholds[clause])) fired.push(clause);
  }

  // Precedence, narrowest gap first. A leg that could not be MEASURED is a
  //
  // `absent` is deliberately NOT a standalone early return. The watchlist
  // regularly holds a leg we have not captured yet while the others are fine,
  // and treating that as "no snapshot" would relabel a perfectly good reading
  // as a capture failure. It only decides the label when NOTHING was
  // measurable, which is the case it actually describes.
  if (insufficient.length > 0) {
    return notEvaluated(REGIME_REASON.INSUFFICIENT_HISTORY, evaluated);
  }
  if (evaluated.length === 0) {
    // Nothing was measurable. Exactly one of three things is true, and each
    // has a different operational fix, so the label must distinguish them:
    //   absent  -> the capture never ran        (NO_SNAPSHOT)
    //   short   -> the capture ran, too little  (INSUFFICIENT_HISTORY)
    //   gap     -> the leg was never applicable (SECTOR_UNMAPPED)
    if (absent.length > 0) return notEvaluated(REGIME_REASON.NO_SNAPSHOT, evaluated);
    if (sectorGap) return notEvaluated(REGIME_REASON.SECTOR_UNMAPPED, evaluated);
    return notEvaluated(REGIME_REASON.INSUFFICIENT_HISTORY, evaluated);
  }
  if (fired.length > 0) {
    return {
      state: 'CAUTION',
      clauses: fired,
      reason: REGIME_REASON.THRESHOLD_FIRED,
      evaluated,
      // The commodity leg may have been skipped even when a DIFFERENT leg
      // fired. Reporting false here would tell the operator the full regime
      // was measured when one of the three clauses never ran — the exact
      // "a gate is silently inactive" failure this project has kept hitting.
      sectorUnmapped: sectorGap,
    };
  }
  return {
    state: 'NEUTRAL',
    clauses: [],
    reason: REGIME_REASON.NO_THRESHOLD_FIRED,
    evaluated,
    // A completed read is still a completed read even when the commodity leg
    // was inapplicable: the operator should see that it was skipped, and the
    // state should reflect the two legs that did run.
    sectorUnmapped: sectorGap,
  };
}
