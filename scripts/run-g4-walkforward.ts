/**
 * G4 walk-forward reporter.
 *
 * Read-only against Postgres: loads successful signal records, rebuilds the
 * Phase 0 card (G0–G3, interim stop, G4 skipped) and the Phase 1 card
 * (G0–G4, ATR stop), scores both on the same canonical path-outcome scorer
 * over the following N trading-day bars, and applies a purged 80/20 split
 * (5-trading-day purge gap per plan §5.9). The ship gate is computed on the
 * OOS fold only; IS and purge-fold stats are reported for transparency but
 * never gate. Comparator is the Phase 0 card, not Adi-only.
 *
 * This script never fails npm test: it prints SHIP_GATE=PASS/FAIL and exits 0
 * even when the gate fails or the database is unavailable.
 *
 * Usage:
 *   npm run walkforward:g4 [--horizon 5]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getSignalRecords, getPriceHistory, getPriorBandarCodes } from '../lib/db';
import { evaluatePlaybook } from '../lib/playbook';
import { buildReplayInput } from '../lib/playbook/replay';
import { defaultCostModel, roundTripCostRate } from '../lib/playbook/costs';
import { buildTapeSnapshot } from '../lib/tape/snapshot';
import { ymdOf } from '../lib/date-ymd';
import type { OhlcBar } from '../lib/tape/ohlc';
import { nextTradingDay, addTradingDays } from '../lib/market-calendar';
import { scorePath, type PathBar, type PathResult } from '../lib/playbook/path-outcome';
import { splitChronological, isCompleteHorizon } from '../lib/playbook/walk-forward';

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

type SystemKey = 'adi-only' | 'phase-0-card' | 'phase-1-card';

interface SystemStats {
  enterN: number;
  scoredN: number;
  expectancyR: number | null;
  profitFactor: number | null;
  nextDayHitR1: number;
  winRate: number;
  maxDD: number;
}

interface SystemSample {
  enterN: number;
  hits: number;
  r: number[];
}

function summarize(sample: SystemSample): SystemStats {
  const r = sample.r;
  const grossProfits = r.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const grossLosses = r.filter((x) => x <= 0).reduce((s, x) => s + Math.abs(x), 0);

  let maxDD = 0;
  let equity = 0;
  let peak = 0;
  for (const x of r) {
    equity += x;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }

  return {
    enterN: sample.enterN,
    scoredN: r.length,
    expectancyR: r.length > 0 ? r.reduce((s, x) => s + x, 0) / r.length : null,
    profitFactor:
      r.length > 0
        ? grossLosses > 0
          ? grossProfits / grossLosses
          : grossProfits > 0
            ? Infinity
            : 0
        : null,
    nextDayHitR1: sample.hits,
    winRate: r.length > 0 ? r.filter((x) => x > 0).length / r.length : 0,
    maxDD,
  };
}

function emptySample(): SystemSample {
  return { enterN: 0, hits: 0, r: [] };
}

function rMultipleOf(result: PathResult): number | null {
  return result.unscored ? null : result.rMultiple;
}

async function main(): Promise<void> {
  const horizon = Number(option('--horizon', '5'));
  const costs = defaultCostModel();
  const costRate = roundTripCostRate(costs);

  const signals = await getSignalRecords();

  // Date-partitioned samples so the ship gate can be OOS-only.
  const perDate = new Map<string, Record<SystemKey, SystemSample>>();
  const ensureDate = (date: string): Record<SystemKey, SystemSample> => {
    let entry = perDate.get(date);
    if (!entry) {
      entry = {
        'adi-only': emptySample(),
        'phase-0-card': emptySample(),
        'phase-1-card': emptySample(),
      };
      perDate.set(date, entry);
    }
    return entry;
  };

  let nUnscored = 0;
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
      close: Number(row.close ?? 0),
    }));
    // Plan §5.9: tail rows whose N-session horizon has not fully elapsed are
    // unscored — neither IS nor OOS — never a fabricated expiry exit.
    if (!isCompleteHorizon(asOf, bars.map((b) => b.date), horizon)) {
      nUnscored += 1;
      nTruncated += 1;
      continue;
    }
    const hitR1 = bars[0].high >= signal.target_realistis;

    // System 0: Adi-only, Phase 0 interim stop, every success print is a trade.
    // arb must be a positive price to size the interim stop; arb null or <= 0
    // (degenerate no-bid book) ⇒ unscored, never a fabricated zero stop.
    if (signal.arb === null || !(signal.arb > 0)) {
      nUnscored += 1;
      continue;
    }
    const interimStop = Math.min(signal.arb, Math.round(signal.rata_rata_bandar * 0.97));
    const adiOnly = rMultipleOf(
      scorePath({
        entry: signal.harga,
        r1: signal.target_realistis,
        max: signal.target_max,
        invalidation: interimStop,
        costRate,
        bars,
      })
    );
    buckets['adi-only'].enterN += 1;
    if (hitR1) buckets['adi-only'].hits += 1;
    if (adiOnly !== null) buckets['adi-only'].r.push(adiOnly);

    // Systems 1 and 2 share the G0–G3 replay input.
    const priorBandar = await getPriorBandarCodes(signal.emiten, asOf);
    const replay = buildReplayInput(signal, priorBandar);
    if (!replay) {
      nUnscored += 1;
      continue;
    }

    // Tape for replay mirrors the live watchlist job exactly: the signal was
    // journaled during the session, so today's (from_date) running bar was
    // excluded at decision time. liveIncompleteToday=true ⇒ date < asOf.
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

    // Phase 0 card: G0–G3 live, G4 skipped (replay flag only).
    const phase0 = evaluatePlaybook({ ...replay, replayG4Skipped: true });
    // Phase 1 card: G0–G4 with the tape filter and ATR stop.
    const phase1 = evaluatePlaybook({ ...replay, tape });

    for (const [system, card] of [
      ['phase-0-card', phase0],
      ['phase-1-card', phase1],
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
      if (hitR1) buckets[system].hits += 1;
      if (r !== null) buckets[system].r.push(r);
    }
  }

  // Universe for the split: only dates that produced at least one scorable
  // system sample (plan §5.9: unscored tail rows are neither IS nor OOS).
  const eligibleDates: string[] = [];
  for (const [date, entry] of perDate) {
    const hasSample = entry['adi-only'].enterN > 0 || entry['phase-0-card'].enterN > 0 || entry['phase-1-card'].enterN > 0;
    if (hasSample) eligibleDates.push(date);
  }

  const split = splitChronological(eligibleDates, { isFraction: 0.8, purgeSessions: 5 });

  const fold = (
    dates: string[]
  ): Record<SystemKey, SystemSample> => {
    const acc: Record<SystemKey, SystemSample> = {
      'adi-only': emptySample(),
      'phase-0-card': emptySample(),
      'phase-1-card': emptySample(),
    };
    for (const date of dates) {
      const entry = perDate.get(date);
      if (!entry) continue;
      for (const system of ['adi-only', 'phase-0-card', 'phase-1-card'] as const) {
        acc[system].enterN += entry[system].enterN;
        acc[system].hits += entry[system].hits;
        acc[system].r.push(...entry[system].r);
      }
    }
    return acc;
  };

  const isSample = fold(split.is);
  const oosSample = fold(split.oos);

  const report = {
    nSignals: signals.length,
    nUnscored,
    // Primary-reason classification: horizon truncation is checked first,
    // so a row that is both truncated AND fail-closed counts as truncated.
    nUnscoredTruncatedHorizon: nTruncated,
    nUnscoredFailClosed: nUnscored - nTruncated,
    nIS: split.is.length,
    nOOS: split.oos.length,
    nPurged: split.purged.length,
    cut: split.cut,
    params:
      'frozen: atrPeriod=14 emaPeriod=20 k=1.0; no IS tuning; comparator=phase-0-card; p3=close>prev.high AND close>=ema20',
    is: {} as Record<SystemKey, SystemStats>,
    oos: {} as Record<SystemKey, SystemStats>,
    ship: {
      beatExpectancy: false,
      beatPF: false,
      sampleFloorMet: false,
      pass: false,
      oosEnterPhase0: 0,
      oosEnterPhase1: 0,
    },
  };

  for (const system of ['adi-only', 'phase-0-card', 'phase-1-card'] as const) {
    report.is[system] = summarize(isSample[system]);
    report.oos[system] = summarize(oosSample[system]);
  }

  const p0 = report.oos['phase-0-card'];
  const p1 = report.oos['phase-1-card'];
  report.ship.oosEnterPhase0 = p0.enterN;
  report.ship.oosEnterPhase1 = p1.enterN;
  report.ship.beatExpectancy =
    p1.expectancyR !== null && p0.expectancyR !== null && p1.expectancyR > p0.expectancyR;
  report.ship.beatPF =
    p1.profitFactor !== null &&
    p0.profitFactor !== null &&
    Number.isFinite(p1.profitFactor) &&
    Number.isFinite(p0.profitFactor) &&
    p1.profitFactor >= p0.profitFactor;
  report.ship.sampleFloorMet = p1.enterN >= 30;
  report.ship.pass = report.ship.beatExpectancy && report.ship.beatPF && report.ship.sampleFloorMet;

  mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'artifacts', 'g4-walkforward.json'),
    JSON.stringify(report, null, 2) + '\n'
  );

  console.log(JSON.stringify(report, null, 2));
  console.log(`SHIP_GATE=${report.ship.pass ? 'PASS' : 'FAIL'}`);
  process.exit(0);
}

loadDotEnvLocal();
main().catch((error) => {
  console.error('walkforward:g4 error:', error instanceof Error ? error.message : String(error));
  console.log('SHIP_GATE=FAIL');
  process.exit(0);
});
