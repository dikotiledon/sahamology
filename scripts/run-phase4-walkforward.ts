/**
 * Phase 4 walk-forward reporter (G7 macro regime).
 *
 * A REPORTER, not a CI gate — same contract as `run-phase3-walkforward.ts`. It
 * prints its verdict on the last line and always exits 0 when it produced one:
 *
 *   SHIP_GATE=PASS                  all eight conditions hold on the OOS fold
 *   SHIP_GATE=FAIL                  the sample was measurable and the gate lost
 *   SHIP_GATE=VERDICT_UNREACHABLE   the sample cannot judge the gate yet
 *
 * The third token is not a euphemism for FAIL. Phase 4 needs 30 OOS ENTERs on
 * system (4) and, because the 0.60 no-collapse guard is measured against the
 * Phase 3 baseline, 50 on system (3) before the ratio has any meaning. The
 * historical signal set has 13 successful rows across 3 dates, and macro
 * coverage did not exist before migration 026, so today's honest answer is
 * VERDICT_UNREACHABLE. Printing FAIL for that would be a false claim about the
 * code, and would train the operator to ignore FAIL.
 *
 * FOUR SYSTEMS, PAIRED. The same signal rows, the same horizon bars, the same
 * tape snapshot, evaluated four ways:
 *   (1) phase-1-card  G0-G3 with the interim stop
 *   (2) phase-2-card  + micro (G1 phase-2 profile)
 *   (3) phase-3-card  + micro + G5 fundamental veto        <- the baseline
 *   (4) phase-4-card  + micro + G5 + G7 macro regime hold  <- the candidate
 *
 * The Phase 4 arm reads the STORED macro snapshot. It NEVER re-fetches: a
 * replay of a historical session that re-fetched today's macro history would
 * grade a past decision with present-day prices, which is the lookahead this
 * whole layer exists to prevent. `buildReplayMacro` returns null when the
 * reading is absent, degraded, undated, or forward-dated, and a null is
 * counted as UNSCORED — never as a neutral pass. A fabricated "the regime was
 * fine" would pad the treatment arm with signals it never examined, and would
 * do so on exactly the days that matter, because macro state is what selects
 * for adverse sessions.
 *
 * Read-only against Postgres. Writes only the local artifact file.
 * Usage: npm run walkforward:p4 [--horizon 5]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  getSignalRecords,
  getPriceHistory,
  getPriorBandarCodes,
  getFlowWindow,
  getKeystatsSnapshot,
  getMacroSnapshotWindow,
} from '../lib/db';
import { evaluatePlaybook } from '../lib/playbook';
import {
  buildReplayInput,
  buildReplayMicro,
  buildReplayFundamentals,
  buildReplayMacro,
  type ReplayMacroBar,
} from '../lib/playbook/replay';
import { defaultCostModel, roundTripCostRate } from '../lib/playbook/costs';
import { buildTapeSnapshot } from '../lib/tape/snapshot';
import { ymdOf } from '../lib/date-ymd';
import type { OhlcBar } from '../lib/tape/ohlc';
import { nextTradingDay, addTradingDays } from '../lib/market-calendar';
import { scorePath, type PathBar, type PathResult } from '../lib/playbook/path-outcome';
import { splitChronological, isCompleteHorizon } from '../lib/playbook/walk-forward';
import {
  computeMicroCoverage,
  evaluatePhase4ShipGate,
  scoreSystem,
  FUNDAMENTAL_BOUNDS,
  MACRO_BOUNDS,
  PHASE3_SAMPLE_FEASIBILITY,
  PHASE4_SAMPLE_FEASIBILITY,
  type CoverageRow,
} from '../lib/playbook/walk-forward-p2';
import { FLOW_WINDOW } from '../lib/micro/flow';
import { REGIME_WINDOW } from '../lib/macro/classifier';
import { MACRO_SERIES, type MacroSeries } from '../lib/macro/types';

const ARTIFACT = join(process.cwd(), 'artifacts', 'phase4-walkforward.json');

/**
 * Legs whose bars the regime classifier actually reads.
 *
 * The sector-commodity leg is driven by the emiten's sector, which the
 * capture has not yet measured, so it is not fetched here. The three legs below
 * are the ones a CAUTION can be raised from today. Reading MORE than the
 * classifier consumes would look like better coverage while costing four
 * queries per signal for bars nothing scores.
 */
const REGIME_LEGS: readonly MacroSeries[] = ['IHSG', 'USDIDR', 'XAU'];

function loadDotEnvLocal(): void {
  try {
    const envContent = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.substring(1, value.length - 1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local may not exist.
  }
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

/** PathResult -> number | null. A phantom 0R is never a win. */
function rMultipleOf(result: PathResult): number | null {
  return result.unscored ? null : result.rMultiple;
}

type SystemKey = 'phase-1-card' | 'phase-2-card' | 'phase-3-card' | 'phase-4-card';

interface SystemSample {
  enterN: number;
  r: number[];
}

function emptySample(): SystemSample {
  return { enterN: 0, r: [] };
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const horizon = Number(option('--horizon', '5'));
  const costRate = roundTripCostRate(defaultCostModel());

  const signals = await getSignalRecords();
  console.log(`Loaded ${signals.length} successful signal row(s).`);

  if (signals.length === 0) {
    console.error('No successful signals yet — nothing to score. That is a capture problem, not a verdict.');
    console.log('SHIP_GATE=VERDICT_UNREACHABLE');
    return;
  }

  const perDate = new Map<string, Record<SystemKey, SystemSample>>();
  const ensureDate = (date: string): Record<SystemKey, SystemSample> => {
    let entry = perDate.get(date);
    if (!entry) {
      entry = {
        'phase-1-card': emptySample(),
        'phase-2-card': emptySample(),
        'phase-3-card': emptySample(),
        'phase-4-card': emptySample(),
      };
      perDate.set(date, entry);
    }
    return entry;
  };

  const coverageByDate = new Map<string, CoverageRow[]>();
  const pushCoverage = (date: string, row: CoverageRow): void => {
    const list = coverageByDate.get(date) ?? [];
    list.push(row);
    coverageByDate.set(date, list);
  };

  /**
   * Macro coverage shares the SAME denominator E as the micro and fundamental
   * layers, and is tracked separately: the three captures fail independently,
   * so a degraded macro capture must not be charged to the other two.
   */
  const macroByDate = new Map<string, { scored: number; incomplete: number }>();
  const pushMacro = (date: string, scored: boolean, incomplete: boolean): void => {
    const entry = macroByDate.get(date) ?? { scored: 0, incomplete: 0 };
    if (scored) entry.scored += 1;
    if (incomplete) entry.incomplete += 1;
    macroByDate.set(date, entry);
  };

  let nTruncated = 0;
  let nHeld = 0;

  for (const signal of signals) {
    const asOf = signal.from_date;
    const buckets = ensureDate(asOf);

    const bars: PathBar[] = (
      await getPriceHistory(signal.emiten, nextTradingDay(asOf), addTradingDays(asOf, horizon))
    ).map((row) => ({
      date: ymdOf(row.date),
      high: Number(row.high ?? row.close ?? 0),
      low: Number(row.low ?? row.close ?? 0),
      close: Number(row.close ?? row.close ?? 0),
    }));

    // §5.9: tail rows whose N-session horizon has not fully elapsed are
    // unscored — neither IS nor OOS — never a fabricated expiry exit.
    if (!isCompleteHorizon(asOf, bars.map((b) => b.date), horizon)) {
      nTruncated += 1;
      continue;
    }

    const priorBandar = await getPriorBandarCodes(signal.emiten, asOf);
    const replay = buildReplayInput(signal, priorBandar);
    if (!replay) {
      pushCoverage(asOf, {
        accdistState: 'UNKNOWN',
        flowEvaluated: false,
        scored: false,
        unscoredReason: 'fail-closed-book',
      });
      pushMacro(asOf, false, signal.macro_incomplete === true);
      continue;
    }

    // Tape mirrors the live job exactly: the signal was journaled during the
    // session, so today's running bar was excluded at decision time.
    const tapeBars: OhlcBar[] = (
      await getPriceHistory(signal.emiten, addTradingDays(asOf, -40), addTradingDays(asOf, -1))
    ).map((row) => ({
      date: ymdOf(row.date),
      open: Number(row.open ?? row.close ?? 0),
      high: Number(row.high ?? row.close ?? 0),
      low: Number(row.low ?? row.close ?? 0),
      close: Number(row.close ?? 0),
    }));
    const tape = buildTapeSnapshot({
      bars: tapeBars,
      asOf,
      liveIncompleteToday: true,
      bandar: signal.rata_rata_bandar,
      todayBandar: signal.bandar,
      priorBandar,
    });

    const flowWindow = signal.bandar
      ? await getFlowWindow(signal.emiten, signal.bandar, asOf, FLOW_WINDOW)
      : [];
    const micro = buildReplayMicro(signal, flowWindow, { bandCode: signal.bandar, priorBandar });
    const microArmed = micro
      ? { ...replay, tape, g1Profile: 'phase-2' as const, micro }
      : { ...replay, tape, g1Profile: 'phase-2' as const };

    // System (1): the Phase 1 card.
    const card1 = evaluatePlaybook({ ...replay, tape });
    // System (2): the Phase 2 card.
    const card2 = evaluatePlaybook(microArmed);
    // System (3): the Phase 3 arm — the baseline the Phase 4 gate compares
    // against. The fundamental reading comes only from a persisted,
    // point-in-time snapshot; no vendor call on this path.
    const snapshot = await getKeystatsSnapshot(signal.emiten, asOf);
    const fundamental = buildReplayFundamentals(signal, snapshot);
    const withG5 = fundamental
      ? { ...microArmed, g5Profile: 'veto' as const, fundamental }
      : { ...microArmed, g5Profile: 'veto' as const };
    const card3 = evaluatePlaybook(withG5);

    // System (4): the Phase 4 candidate. The regime reading comes only from
    // STORED macro bars at or before the signal date.
    const macroBars: ReplayMacroBar[] = [];
    for (const symbol of REGIME_LEGS) {
      const window = await getMacroSnapshotWindow(symbol, asOf, REGIME_WINDOW + 1);
      for (const bar of window) {
        macroBars.push({ symbol: bar.symbol, barDate: bar.barDate, close: bar.close });
      }
    }
    const macro = buildReplayMacro(signal, macroBars, { sector: signal.sector ?? null });
    const withG7 = macro
      ? { ...withG5, g7Profile: 'veto' as const, macro }
      : { ...withG5, g7Profile: 'veto' as const };
    const card4 = evaluatePlaybook(withG7);

    // G7's notch: an ENTER on the baseline arm that the armed regime turned
    // into a WAIT. Counted against card3, because that is the arm the gate
    // compares.
    const wasEnter = card3.stance === 'ENTER';
    const isHeld = wasEnter && card4.stance === 'WAIT';
    if (isHeld) nHeld += 1;

    for (const [system, card] of [
      ['phase-1-card', card1],
      ['phase-2-card', card2],
      ['phase-3-card', card3],
      ['phase-4-card', card4],
    ] as const) {
      if (card.stance !== 'ENTER' || card.entry === null || card.invalidation === null) continue;
      const r = rMultipleOf(
        scorePath({
          entry: card.entry,
          r1: card.r1 ?? signal.target_realistis,
          max: card.max ?? signal.target_max,
          invalidation: card.invalidation,
          costRate,
          bars,
        }),
      );
      buckets[system].enterN += 1;
      if (r !== null) buckets[system].r.push(r);
    }

    // §6.1: coverage is measured over the PRE-GATED eligible set E, so a gate
    // that filters everything out still reports its own capture quality.
    pushCoverage(asOf, {
      accdistState: micro?.accdistState ?? 'UNKNOWN',
      flowEvaluated: micro != null && micro.flowState !== 'NOT_EVALUATED',
      scored: micro != null,
    });
    pushMacro(asOf, macro !== null, signal.macro_incomplete === true);
  }

  // Universe for the split: only dates that produced at least one scorable
  // sample. Truncated horizons are neither IS nor OOS.
  const eligibleDates = [...perDate.keys()]
    .filter((date) => {
      const b = perDate.get(date)!;
      return (
        b['phase-1-card'].enterN +
          b['phase-2-card'].enterN +
          b['phase-3-card'].enterN +
          b['phase-4-card'].enterN >
        0
      );
    })
    .sort();

  const split = splitChronological(eligibleDates, { isFraction: 0.8, purgeSessions: 5 });

  const foldSample = (date: string): Record<SystemKey, SystemSample> => perDate.get(date)!;

  // scoreSystem's second argument is the TRUE ENTER count, which is NOT
  // r.length: an ENTER whose path had zero risk is still an entry.
  const foldScore = (dates: readonly string[], system: SystemKey) =>
    scoreSystem(
      dates.flatMap((d) => foldSample(d)[system].r),
      dates.reduce((s, d) => s + foldSample(d)[system].enterN, 0),
    );
  const isSample = (system: SystemKey) => foldScore(split.is, system);
  const oosSample = (system: SystemKey) => foldScore(split.oos, system);

  const phase3 = oosSample('phase-3-card');
  const phase4 = oosSample('phase-4-card');
  const coverage = computeMicroCoverage(split.oos.flatMap((d) => coverageByDate.get(d) ?? []));

  // Macro coverage shares the SAME denominator E as the micro layer, so the
  // rates are directly comparable and neither can be flattered by choosing its
  // own population after the fact.
  const oosMacroRows = split.oos.flatMap((d) => {
    const b = perDate.get(d);
    if (!b) return [];
    const total =
      b['phase-1-card'].enterN +
      b['phase-2-card'].enterN +
      b['phase-3-card'].enterN +
      b['phase-4-card'].enterN;
    return Array.from({ length: total }, () => macroByDate.get(d) ?? { scored: 0, incomplete: 0 });
  });
  const denom = oosMacroRows.length;
  const macroCoverage = {
    macroScoredRate: denom === 0 ? 0 : oosMacroRows.filter((r) => r.scored).length / denom,
    macroIncompleteRate:
      denom === 0 ? 0 : oosMacroRows.filter((r) => r.incomplete).length / denom,
  };

  // The hold count is reported across all dates. It is a plausibility signal on
  // the REGIME RUBRIC, not a measured out-of-sample effect, so it is not split
  // by fold — the thing the fold must discipline is the R-multiples, and those
  // are.
  const gate = evaluatePhase4ShipGate({
    coverage,
    macroCoverage,
    phase3,
    phase4,
    held: nHeld,
  });

  const artifact = {
    generatedAt: new Date().toISOString(),
    protocol: {
      horizon,
      costRate,
      split: 'purged 80/20 chronological, 5-trading-day purge gap',
      comparator:
        'phase-3-card, paired on identical signal rows, tape snapshots and horizon bars',
      treatment: 'G7 macro regime hold, armed, single-notch ENTER to WAIT downgrade only',
      pointInTime:
        'macro_snapshot read at as_of = signal.from_date; never re-fetched, never clamped forward',
      legsRead: REGIME_LEGS,
      legsSkipped: MACRO_SERIES.filter((s) => !REGIME_LEGS.includes(s)),
    },
    nSignals: signals.length,
    nEligibleDates: eligibleDates.length,
    nIS: split.is.length,
    nPurged: split.purged.length,
    nOOS: split.oos.length,
    nTruncated: nTruncated,
    nHeldAllDates: nHeld,
    micro: { ...coverage, sampleFeasible: gate.sampleFeasible },
    macro: macroCoverage,
    systems: {
      'phase-1-card': { is: isSample('phase-1-card'), oos: oosSample('phase-1-card') },
      'phase-2-card': { is: isSample('phase-2-card'), oos: oosSample('phase-2-card') },
      'phase-3-card': { is: isSample('phase-3-card'), oos: phase3 },
      'phase-4-card': { is: isSample('phase-4-card'), oos: phase4 },
    },
    ship: {
      verdict: gate.verdict,
      sampleFeasible: gate.sampleFeasible,
      conditions: gate.conditions,
      oosEnterPhase3: gate.oosEnterPhase3,
      oosEnterPhase4: gate.oosEnterPhase4,
      held: gate.held,
      holdRate: gate.holdRate,
      reasons: gate.reasons,
    },
    sampleFeasibility: {
      phase3: PHASE3_SAMPLE_FEASIBILITY,
      phase4: PHASE4_SAMPLE_FEASIBILITY,
    },
    coverageBounds: { ...FUNDAMENTAL_BOUNDS, ...MACRO_BOUNDS },
  };

  mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2));
  console.log(`Wrote ${ARTIFACT}`);

  console.log(
    `Fold: ${split.is.length} IS / ${split.purged.length} purged / ${split.oos.length} OOS date(s) of ${eligibleDates.length} eligible.`,
  );
  console.log(`Phase 3 OOS: enterN=${phase3.enterN} expectancyR=${phase3.expectancyR} PF=${phase3.profitFactor}`);
  console.log(`Phase 4 OOS: enterN=${phase4.enterN} expectancyR=${phase4.expectancyR} PF=${phase4.profitFactor}`);
  console.log(
    `Coverage: E=${coverage.denominator} accdistUnknown=${coverage.accdistUnknownRate.toFixed(4)} flow=${coverage.flowCoverageRate.toFixed(4)} unscored=${coverage.unscoredShare.toFixed(4)}`,
  );
  console.log(
    `Macro: scored=${macroCoverage.macroScoredRate.toFixed(4)} incomplete=${macroCoverage.macroIncompleteRate.toFixed(4)} held=${nHeld} holdRate=${gate.holdRate.toFixed(4)}`,
  );

  if (gate.verdict === 'VERDICT_UNREACHABLE') {
    console.log('sampleFeasible: false');
    console.log(
      'The sample cannot judge this gate yet. That is not a pass and not a failure — it is a gate that has not been measured.',
    );
    console.log('SHIP_GATE=VERDICT_UNREACHABLE');
  } else {
    for (const reason of gate.reasons) console.log(`- ${reason}`);
    console.log(`SHIP_GATE=${gate.verdict}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('walkforward:p4 error:', message);
  // Deliberately NOT `SHIP_GATE=FAIL`. An unreachable database is an environment
  // error, not a measured loss of edge, and printing FAIL would be a false
  // claim about the code — the exact confusion Phase 3's D17 was written to end.
  console.error('No verdict produced. The database was unreachable, so the gate was not evaluated.');
  process.exit(1);
});
