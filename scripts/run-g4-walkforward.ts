/**
 * G4 walk-forward reporter.
 *
 * Read-only against Postgres: loads successful signal records, rebuilds the
 * Phase 0 card (G0–G3, interim stop, G4 skipped) and the Phase 1 card
 * (G0–G4, ATR stop), scores both on the same canonical path-outcome scorer
 * over the following N trading-day bars, and applies a purged 80/20 split
 * (5-session purge gap). Comparator is the Phase 0 card, not Adi-only.
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
import type { OhlcBar } from '../lib/tape/ohlc';
import { nextTradingDay, addTradingDays } from '../lib/market-calendar';
import { scorePath, type PathBar, type PathResult } from '../lib/playbook/path-outcome';
import { splitChronological } from '../lib/playbook/walk-forward';

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

function summarize(rMultiples: number[], nextDayHits: number, enterN: number): SystemStats {
  const grossProfits = rMultiples.filter((x) => x > 0).reduce((s, x) => s + x, 0);
  const grossLosses = rMultiples.filter((x) => x <= 0).reduce((s, x) => s + Math.abs(x), 0);

  let maxDD = 0;
  let equity = 0;
  let peak = 0;
  for (const x of rMultiples) {
    equity += x;
    peak = Math.max(peak, equity);
    maxDD = Math.max(maxDD, peak - equity);
  }

  return {
    enterN,
    scoredN: rMultiples.length,
    expectancyR: rMultiples.length > 0 ? rMultiples.reduce((s, x) => s + x, 0) / rMultiples.length : null,
    profitFactor:
      rMultiples.length > 0
        ? grossLosses > 0
          ? grossProfits / grossLosses
          : grossProfits > 0
            ? Infinity
            : 0
        : null,
    nextDayHitR1: nextDayHits,
    winRate: rMultiples.length > 0 ? rMultiples.filter((x) => x > 0).length / rMultiples.length : 0,
    maxDD,
  };
}

function rMultipleOf(result: PathResult): number | null {
  return result.unscored ? null : result.rMultiple;
}

async function main(): Promise<void> {
  const horizon = Number(option('--horizon', '5'));
  const costs = defaultCostModel();
  const costRate = roundTripCostRate(costs);

  const signals = await getSignalRecords();
  const stats: Record<SystemKey, { r: number[]; hits: number; enterN: number }> = {
    'adi-only': { r: [], hits: 0, enterN: 0 },
    'phase-0-card': { r: [], hits: 0, enterN: 0 },
    'phase-1-card': { r: [], hits: 0, enterN: 0 },
  };

  let nUnscored = 0;

  for (const signal of signals) {
    const asOf = signal.from_date;
    const bars: PathBar[] = (
      await getPriceHistory(signal.emiten, nextTradingDay(asOf), addTradingDays(asOf, horizon))
    ).map((row) => ({
      date: String(row.date).slice(0, 10),
      high: Number(row.high ?? row.close ?? 0),
      low: Number(row.low ?? row.close ?? 0),
      close: Number(row.close ?? 0),
    }));
    if (bars.length === 0) {
      nUnscored += 1;
      continue;
    }
    const hitR1 = bars[0].high >= signal.target_realistis;

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
    stats['adi-only'].enterN += 1;
    if (hitR1) stats['adi-only'].hits += 1;
    if (adiOnly !== null) stats['adi-only'].r.push(adiOnly);

    const priorBandar = await getPriorBandarCodes(signal.emiten, asOf);
    const replay = buildReplayInput(signal, priorBandar);
    if (!replay) {
      nUnscored += 1;
      continue;
    }

    const tapeBars: OhlcBar[] = (
      await getPriceHistory(signal.emiten, addTradingDays(asOf, -40), addTradingDays(asOf, -1))
    ).map((row) => ({
      date: String(row.date).slice(0, 10),
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

    const phase0 = evaluatePlaybook({ ...replay });
    const phase1 = evaluatePlaybook({ ...replay, tape });

    for (const [system, card] of [
      ['phase-0-card', phase0],
      ['phase-1-card', phase1],
    ] as const) {
      if (card.stance !== 'ENTER' || card.entry === null || card.invalidation === null) continue;
      const r = rMultipleOf(
        scorePath({
          entry: card.entry,
          r1: signal.target_realistis,
          max: signal.target_max,
          invalidation: card.invalidation,
          costRate,
          bars,
        })
      );
      stats[system].enterN += 1;
      if (hitR1) stats[system].hits += 1;
      if (r !== null) stats[system].r.push(r);
    }
  }

  const split = splitChronological(
    signals.map((s) => s.from_date),
    { isFraction: 0.8, purgeSessions: 5 }
  );

  const report = {
    nSignals: signals.length,
    nUnscored,
    nIS: split.is.length,
    nOOS: split.oos.length,
    nPurged: split.purged.length,
    params:
      'frozen: atrPeriod=14 emaPeriod=20 k=1.0; no IS tuning; comparator=phase-0-card; p3=close>prev.high AND close>=ema20',
    systems: {} as Record<SystemKey, SystemStats>,
    ship: {
      beatExpectancy: false,
      beatPF: false,
      sampleFloorMet: false,
      pass: false,
    },
  };

  for (const system of ['adi-only', 'phase-0-card', 'phase-1-card'] as const) {
    report.systems[system] = summarize(stats[system].r, stats[system].hits, stats[system].enterN);
  }

  const p0 = report.systems['phase-0-card'];
  const p1 = report.systems['phase-1-card'];
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
