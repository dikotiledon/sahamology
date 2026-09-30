/**
 * Idempotent PathExit backfill for decision_journal.
 *
 * Scores ENTER rows whose N=5 forward horizon is complete. Unscored stays
 * SQL NULL — never 0, never the token `unscored`, never a guessed expiry.
 *
 * Usage: npm run backfill:outcomes [-- --dry-run] [-- --limit 50]
 */
import { fileURLToPath } from 'node:url';
import { addTradingDays, nextTradingDay } from '../lib/market-calendar';
import { isCompleteHorizon } from '../lib/playbook/walk-forward';
import { ymdOf } from '../lib/date-ymd';
import { roundRMultiple, toFiniteNumber } from '../lib/desk/numbers';
import { scoreJournalPath } from '../lib/desk/outcome';
import type { PathExit } from '../lib/playbook/path-outcome';
import {
  getPriceHistory,
  listUnscoredEnterJournal,
  updateDecisionJournalOutcome,
} from '../lib/db';

export interface JournalOutcomeRow {
  id?: unknown;
  emiten?: unknown;
  as_of?: unknown;
  stance?: unknown;
  entry?: unknown;
  r1?: unknown;
  max?: unknown;
  invalidation?: unknown;
}

export interface PriceBarRow {
  date?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
}

export interface BackfillDeps {
  listUnscored: (limit: number) => Promise<JournalOutcomeRow[]>;
  getBars: (emiten: string, from: string, to: string) => Promise<PriceBarRow[]>;
  update: (id: number, outcome: PathExit, rMultiple: number) => Promise<unknown[]>;
}

export interface BackfillOptions {
  dryRun?: boolean;
  limit?: number;
}

export interface BackfillSummary {
  scanned: number;
  scored: number;
  skipped: number;
  dryRun: boolean;
}

const HORIZON = 5;

export async function backfillJournalOutcomes(
  options: BackfillOptions = {},
  deps?: BackfillDeps,
): Promise<BackfillSummary> {
  const listUnscored = deps?.listUnscored ?? listUnscoredEnterJournal;
  const getBars = deps?.getBars ?? getPriceHistory;
  const update = deps?.update ?? updateDecisionJournalOutcome;
  const limit = options.limit ?? 500;
  const dryRun = options.dryRun === true;

  const rows = await listUnscored(limit);
  let scored = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = toFiniteNumber(row.id);
    const emiten = String(row.emiten ?? '').toUpperCase();
    const asOf = ymdOf(row.as_of);
    if (id === null || !emiten || !asOf) {
      skipped += 1;
      continue;
    }

    const from = nextTradingDay(asOf);
    const to = addTradingDays(asOf, HORIZON);
    const rawBars = await getBars(emiten, from, to);
    const bars = rawBars
      .map((bar) => ({
        date: ymdOf(bar.date),
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }))
      .filter((bar) => bar.date > asOf);

    if (!isCompleteHorizon(asOf, bars.map((bar) => bar.date), HORIZON)) {
      skipped += 1;
      continue;
    }

    const result = scoreJournalPath({
      stance: String(row.stance ?? ''),
      asOf,
      entry: row.entry,
      r1: row.r1,
      max: row.max,
      invalidation: row.invalidation,
      bars,
    });
    if (result.unscored) {
      skipped += 1;
      continue;
    }

    scored += 1;
    if (!dryRun) {
      await update(id, result.exit, roundRMultiple(result.rMultiple));
    }
  }

  return { scanned: rows.length, scored, skipped, dryRun };
}

function parseArgs(argv: string[]): BackfillOptions {
  const dryRun = argv.includes('--dry-run');
  const limitFlag = argv.findIndex((a) => a === '--limit');
  const limit = limitFlag >= 0 ? Number(argv[limitFlag + 1]) : undefined;
  return { dryRun, limit: Number.isFinite(limit) ? limit : undefined };
}

const isDirect =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirect) {
  backfillJournalOutcomes(parseArgs(process.argv.slice(2)))
    .then((summary) => {
      console.log(
        `backfill:outcomes scanned=${summary.scanned} scored=${summary.scored} skipped=${summary.skipped} dryRun=${summary.dryRun}`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
