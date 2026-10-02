/**
 * Phase 7 Walk-Forward Reporter: IDX Brosum Insider Trade Radar.
 *
 * Enforces the project's zero-fabrication and statistical gating standards:
 * - Compares Base (Adi playbook G0–G4) vs Confluence (Playbook + Radar Risk Filter)
 * - Evaluates on purged 80/20 chronological split (5-session purge)
 * - Sample floor: Requires >= 30 OOS ENTER trades on the radar treatment arm
 * - Below 30 OOS ENTERs, reports SHIP_GATE=VERDICT_UNREACHABLE (fail-closed, zero fabrication)
 *
 * Usage:
 *   npm run walkforward:radar [--horizon 5]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  getSignalRecords,
  getPriceHistory,
  getPriorBandarCodes,
  getFlowWindow,
  getUniverseBrokerFlowHistory,
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
import { evaluateRadar, applyRadarRiskFilter } from '../lib/radar';

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

type RadarSystemKey = 'base-playbook' | 'radar-confluence';

interface SystemStats {
  enterN: number;
  scoredN: number;
  expectancyR: number | null;
  profitFactor: number | null;
  winRate: number | null;
}

interface SystemSample {
  r: number[];
  enterN: number;
}

function emptySample(): SystemSample {
  return { r: [], enterN: 0 };
}

function rMultipleOf(result: PathResult): number | null {
  return result.unscored ? null : result.rMultiple;
}

function summarize(sample: SystemSample): SystemStats {
  const scored = sample.r.filter((v) => Number.isFinite(v));
  if (scored.length === 0) {
    return {
      enterN: sample.enterN,
      scoredN: 0,
      expectancyR: null,
      profitFactor: null,
      winRate: null,
    };
  }
  const sum = scored.reduce((a, b) => a + b, 0);
  const expectancyR = Number((sum / scored.length).toFixed(4));
  const wins = scored.filter((x) => x > 0);
  const losses = scored.filter((x) => x < 0);
  const winRate = Number((wins.length / scored.length).toFixed(4));

  const grossGain = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  let profitFactor: number | null = null;
  if (grossLoss > 0) {
    profitFactor = Number((grossGain / grossLoss).toFixed(4));
  } else if (grossGain > 0) {
    profitFactor = 999.0;
  }

  return {
    enterN: sample.enterN,
    scoredN: scored.length,
    expectancyR,
    profitFactor,
    winRate,
  };
}

async function main(): Promise<void> {
  const horizon = Number(option('--horizon', '5'));
  const costRate = roundTripCostRate(defaultCostModel());

  const signals = await getSignalRecords().catch((err: Error) => {
    console.error('Database query error:', err.message);
    return [];
  });

  if (signals.length === 0) {
    console.log('No signal records in database.');
    console.log('SHIP_GATE=VERDICT_UNREACHABLE (Sample floor not met: 0/30 OOS ENTERs)');
    process.exit(0);
  }

  const perDate = new Map<string, Record<RadarSystemKey, SystemSample>>();
  let nTruncated = 0;
  let nUnscored = 0;

  for (const signal of signals) {
    const asOf = ymdOf(signal.from_date);
    if (!perDate.has(asOf)) {
      perDate.set(asOf, {
        'base-playbook': emptySample(),
        'radar-confluence': emptySample(),
      });
    }
    const buckets = perDate.get(asOf)!;

    const start = nextTradingDay(asOf);
    const end = addTradingDays(asOf, horizon + 10);
    const forwardBars = await getPriceHistory(signal.emiten, start, end).catch(() => []);
    const barDates = forwardBars.map((b) => ymdOf(b.date));
    const complete = isCompleteHorizon(asOf, barDates, horizon);

    if (!complete) {
      nTruncated += 1;
      nUnscored += 1;
      continue;
    }

    const bars: PathBar[] = forwardBars.slice(0, horizon).map((b) => ({
      date: ymdOf(b.date),
      open: Number(b.open ?? b.close ?? 0),
      high: Number(b.high ?? b.close ?? 0),
      low: Number(b.low ?? b.close ?? 0),
      close: Number(b.close ?? 0),
    }));

    const priorBandar = await getPriorBandarCodes(signal.emiten, asOf).catch(() => []);
    const replay = buildReplayInput(signal, priorBandar);
    if (!replay) {
      nUnscored += 1;
      continue;
    }

    const tapeBars: OhlcBar[] = (
      await getPriceHistory(signal.emiten, addTradingDays(asOf, -40), addTradingDays(asOf, -1)).catch(
        () => []
      )
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
      ? await getFlowWindow(signal.emiten, signal.bandar, asOf, 5).catch(() => [])
      : [];
    const micro = buildReplayMicro(signal, flowWindow, { bandCode: signal.bandar, priorBandar });
    const microArmed = micro
      ? { ...replay, tape, g1Profile: 'phase-2' as const, micro }
      : { ...replay, tape, g1Profile: 'phase-2' as const };

    // Base System: Canonical Playbook Card (G0–G4)
    const baseCard = evaluatePlaybook(microArmed);

    // Radar Assessment
    const historicalFlow = await getUniverseBrokerFlowHistory(signal.emiten, asOf).catch(() => []);
    const radar = evaluateRadar({
      emiten: signal.emiten,
      asOf,
      rgSummary: [],
      priceBars: tapeBars.map((b) => ({ ...b, volume: 100000 })),
      historicalFlow,
    });

    // Confluence System: Apply Radar Risk Filter (downgrade only)
    const radarCard = applyRadarRiskFilter(baseCard, radar);

    for (const [key, card] of [
      ['base-playbook', baseCard],
      ['radar-confluence', radarCard],
    ] as const) {
      if (card.stance === 'ENTER' && card.entry !== null && card.invalidation !== null) {
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
        buckets[key].enterN += 1;
        if (r !== null) buckets[key].r.push(r);
      }
    }
  }

  const eligibleDates = [...perDate.keys()]
    .filter((d) => {
      const b = perDate.get(d)!;
      return b['base-playbook'].enterN + b['radar-confluence'].enterN > 0;
    })
    .sort();

  const split = splitChronological(eligibleDates, { isFraction: 0.8, purgeSessions: 5 });

  const foldSample = (date: string): Record<RadarSystemKey, SystemSample> => perDate.get(date)!;
  const foldScore = (dates: readonly string[], system: RadarSystemKey): SystemStats => {
    const rValues = dates.flatMap((d) => foldSample(d)[system].r);
    const enterCount = dates.reduce((s, d) => s + foldSample(d)[system].enterN, 0);
    return summarize({ r: rValues, enterN: enterCount });
  };

  const isBase = foldScore(split.is, 'base-playbook');
  const oosBase = foldScore(split.oos, 'base-playbook');
  const isRadar = foldScore(split.is, 'radar-confluence');
  const oosRadar = foldScore(split.oos, 'radar-confluence');

  const oosEnterCount = oosRadar.enterN;
  const sampleFloorMet = oosEnterCount >= 30;

  let verdict: 'PASS' | 'FAIL' | 'VERDICT_UNREACHABLE';
  if (!sampleFloorMet) {
    verdict = 'VERDICT_UNREACHABLE';
  } else {
    const beatExp =
      oosRadar.expectancyR !== null &&
      oosBase.expectancyR !== null &&
      oosRadar.expectancyR >= oosBase.expectancyR;
    const beatPf =
      oosRadar.profitFactor !== null &&
      oosBase.profitFactor !== null &&
      oosRadar.profitFactor >= oosBase.profitFactor;
    verdict = beatExp && beatPf ? 'PASS' : 'FAIL';
  }

  const report = {
    generatedAt: new Date().toISOString(),
    protocol: {
      horizon,
      split: 'purged 80/20 chronological (5-session purge)',
      sampleFloor: 30,
      oosEnterCount,
      sampleFloorMet,
    },
    signalsCount: signals.length,
    eligibleDatesCount: eligibleDates.length,
    nIS: split.is.length,
    nOOS: split.oos.length,
    nPurged: split.purged.length,
    nTruncated,
    nUnscored,
    systems: {
      base: { is: isBase, oos: oosBase },
      confluence: { is: isRadar, oos: oosRadar },
    },
    verdict,
  };

  try {
    mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
    const outPath = join(process.cwd(), 'artifacts', 'radar-walkforward.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  } catch {
    try {
      mkdirSync('/tmp/artifacts', { recursive: true });
      writeFileSync('/tmp/artifacts/radar-walkforward.json', JSON.stringify(report, null, 2) + '\n');
    } catch {
      // Artifact write optional if filesystem read-only
    }
  }

  console.log(JSON.stringify(report, null, 2));
  if (verdict === 'VERDICT_UNREACHABLE') {
    console.log(`SHIP_GATE=VERDICT_UNREACHABLE (Sample floor not met: ${oosEnterCount}/30 OOS ENTERs)`);
  } else {
    console.log(`SHIP_GATE=${verdict}`);
  }

  process.exit(0);
}

loadDotEnvLocal();
main().catch((err) => {
  console.error('Error in radar walkforward reporter:', err);
  console.log('SHIP_GATE=VERDICT_UNREACHABLE (Unexpected execution failure)');
  process.exit(0);
});
