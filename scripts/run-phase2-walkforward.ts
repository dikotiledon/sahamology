/**
 * Phase 2 walk-forward reporter (plan Task 9, M16, §6).
 *
 * A REPORTER, not a CI gate: it always exits 0 and prints its verdict on the
 * last line. No test greps `SHIP_GATE`. The verdict vocabulary is:
 *
 *   SHIP_GATE=PASS                  all seven D10 conditions hold on the OOS fold
 *   SHIP_GATE=FAIL                  the sample was measurable and the gate lost
 *   SHIP_GATE=VERDICT_UNREACHABLE   the sample cannot judge the gate yet (D17)
 *
 * D17 is why the third token exists. The 30-ENTER floor composes with the
 * 0.60 no-collapse guard: system (2) needs 50 OOS ENTERs before condition (4)
 * has a baseline, which at 8 emitens is roughly 300 unique eligible dates
 * (~14 months). Printing FAIL for that whole window would be a false claim
 * about the code and would train the operator to ignore FAIL.
 *
 * Both cards are scored on the SAME signal rows and the SAME horizon bars, so
 * the Phase 1 vs Phase 2 comparison is paired — not two different universes.
 *
 * Read-only against Postgres. Usage: npm run walkforward:p2 [--horizon 5]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  getSignalRecords,
  getPriceHistory,
  getPriorBandarCodes,
  getFlowWindow,
} from '../lib/db';
import { evaluatePlaybook } from '../lib/playbook';
import { buildReplayInput, buildReplayMicro } from '../lib/playbook/replay';
import { defaultCostModel, roundTripCostRate } from '../lib/playbook/costs';
import { buildTapeSnapshot } from '../lib/tape/snapshot';
import { ymdOf } from '../lib/date-ymd';
import type { OhlcBar } from '../lib/tape/ohlc';
import { nextTradingDay, addTradingDays } from '../lib/market-calendar';
import { scorePath, type PathBar, type PathResult } from '../lib/playbook/path-outcome';
import { splitChronological, isCompleteHorizon } from '../lib/playbook/walk-forward';
import {
  computeMicroCoverage,
  evaluateShipGate,
  scoreSystem,
  SAMPLE_FEASIBILITY,
  COVERAGE_BOUNDS,
  type CoverageRow,
} from '../lib/playbook/walk-forward-p2';
import { FLOW_WINDOW } from '../lib/micro/flow';

const ARTIFACT = join(process.cwd(), 'artifacts', 'phase2-walkforward.json');

function loadDotEnvLocal(): void {
  try {
    const envContent = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^\s*([^#=]+?)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
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

type SystemKey = 'phase-1-card' | 'phase-2-card';

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

  // Date-partitioned samples so the ship gate is OOS-only.
  const perDate = new Map<string, Record<SystemKey, SystemSample>>();
  const ensureDate = (date: string): Record<SystemKey, SystemSample> => {
    let entry = perDate.get(date);
    if (!entry) {
      entry = { 'phase-1-card': emptySample(), 'phase-2-card': emptySample() };
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

  let nTruncated = 0;

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

    // Plan §5.9: tail rows whose N-session horizon has not fully elapsed are
    // unscored — neither IS nor OOS — never a fabricated expiry exit.
    if (!isCompleteHorizon(asOf, bars.map((b) => b.date), horizon)) {
      nTruncated += 1;
      continue;
    }

    const priorBandar = await getPriorBandarCodes(signal.emiten, asOf);
    const replay = buildReplayInput(signal, priorBandar);
    if (!replay) {
      pushCoverage(asOf, { accdistState: 'UNKNOWN', flowEvaluated: false, scored: false, unscoredReason: 'fail-closed-book' });
      continue;
    }

    // Tape for replay mirrors the live watchlist job exactly: the signal was
    // journaled during the session, so today's running bar was excluded at
    // decision time.
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

    // System (2): the Phase 1 card — the comparator the plan names.
    const card1 = evaluatePlaybook({ ...replay, tape });
    // System (3): the Phase 2 card — the candidate, micro-gated.
    const flowWindow = signal.bandar
      ? await getFlowWindow(signal.emiten, signal.bandar, asOf, FLOW_WINDOW)
      : [];
    const micro = buildReplayMicro(signal, flowWindow, { bandCode: signal.bandar, priorBandar });
    const card3 = evaluatePlaybook(
      micro ? { ...replay, tape, g1Profile: 'phase-2', micro } : { ...replay, tape, g1Profile: 'phase-2' }
    );

    for (const [system, card] of [
      ['phase-1-card', card1],
      ['phase-2-card', card3],
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
        })
      );
      buckets[system].enterN += 1;
      if (r !== null) buckets[system].r.push(r);
    }

    // §6.1: coverage is measured over the PRE-GATED eligible set E, so a gate
    // that filters everything out still reports its own capture quality.
    //
    // `scored` is deliberately NOT `card3.stance === 'ENTER'`. That would charge
    // every G1 rejection as a data-availability miss, so a gate working exactly
    // as designed would inflate unscoredShare and fail the <= 0.25 cap on its
    // own strictness. "Unscored" means the micro layer LACKED data (buildReplayMicro
    // returned null: no acc/dist reading, no flow row, or a D18 degraded
    // capture). A gate that says "no" to well-captured data is a gate result,
    // not a coverage failure.
    pushCoverage(asOf, {
      accdistState: micro?.accdistState ?? 'UNKNOWN',
      flowEvaluated: micro != null && micro.flowState !== 'NOT_EVALUATED',
      scored: micro != null,
    });
  }

  // Universe for the split: only dates that produced at least one scorable
  // sample. Truncated horizons are neither IS nor OOS.
  const eligibleDates = [...perDate.keys()].filter((date) => {
    const b = perDate.get(date)!;
    return b['phase-1-card'].enterN + b['phase-2-card'].enterN > 0;
  }).sort();

  const split = splitChronological(eligibleDates, { isFraction: 0.8, purgeSessions: 5 });

  const foldSample = (date: string): Record<SystemKey, SystemSample> => perDate.get(date)!;

  // scoreSystem's second argument is the TRUE ENTER count, which is NOT
  // r.length: an ENTER whose path had zero risk is still an entry.
  const foldScore = (dates: readonly string[], system: SystemKey) =>
    scoreSystem(
      dates.flatMap((d) => foldSample(d)[system].r),
      dates.reduce((s, d) => s + foldSample(d)[system].enterN, 0)
    );
  const isSample = (system: SystemKey) => foldScore(split.is, system);
  const oosSample = (system: SystemKey) => foldScore(split.oos, system);

  const phase1 = oosSample('phase-1-card');
  const phase2 = oosSample('phase-2-card');
  const coverage = computeMicroCoverage(split.oos.flatMap((d) => coverageByDate.get(d) ?? []));
  const gate = evaluateShipGate({ coverage, phase1, phase2 });

  const artifact = {
    generatedAt: new Date().toISOString(),
    protocol: {
      horizon,
      costRate,
      split: 'purged 80/20 chronological, 5-trading-day purge gap',
      comparator: 'phase-1-card, paired on identical signal rows and horizon bars',
      frozen: 'flowWindow=5, flowConsistencyFloor=60, flowMinActiveDays=3, persistence window=3',
    },
    nSignals: signals.length,
    nEligibleDates: eligibleDates.length,
    nIS: split.is.length,
    nPurged: split.purged.length,
    nOOS: split.oos.length,
    nTruncated: nTruncated,
    micro: { ...coverage, sampleFeasible: gate.sampleFeasible },
    systems: {
      'phase-1-card': { is: isSample('phase-1-card'), oos: phase1 },
      'phase-2-card': { is: isSample('phase-2-card'), oos: phase2 },
    },
    ship: {
      verdict: gate.verdict,
      sampleFeasible: gate.sampleFeasible,
      conditions: gate.conditions,
      oosEnterPhase1: gate.oosEnterPhase1,
      oosEnterPhase2: gate.oosEnterPhase2,
      reasons: gate.reasons,
    },
    sampleFeasibility: SAMPLE_FEASIBILITY,
    coverageBounds: COVERAGE_BOUNDS,
  };

  mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2));
  console.log(`Wrote ${ARTIFACT}`);

  console.log(
    `Fold: ${split.is.length} IS / ${split.purged.length} purged / ${split.oos.length} OOS date(s) of ${eligibleDates.length} eligible.`,
  );
  console.log(`Phase 1 OOS: enterN=${phase1.enterN} expectancyR=${phase1.expectancyR} PF=${phase1.profitFactor}`);
  console.log(`Phase 2 OOS: enterN=${phase2.enterN} expectancyR=${phase2.expectancyR} PF=${phase2.profitFactor}`);
  console.log(`Coverage: E=${coverage.denominator} accdistUnknown=${coverage.accdistUnknownRate.toFixed(4)} flow=${coverage.flowCoverageRate.toFixed(4)} unscored=${coverage.unscoredShare.toFixed(4)}`);

  if (gate.verdict === 'VERDICT_UNREACHABLE') {
    console.log('sampleFeasible: false');
    console.log('SHIP_GATE=VERDICT_UNREACHABLE');
  } else {
    console.log(`SHIP_GATE=${gate.verdict}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('walkforward:p2 error:', message);
  // Deliberately NOT `SHIP_GATE=FAIL`. A missing database is an environment
  // error, not a measured loss of edge, and printing FAIL would be a false
  // claim about the code — the exact confusion D17 was written to end.
  console.error('No verdict produced. The database was unreachable, so the gate was not evaluated.');
  process.exit(1);
});
