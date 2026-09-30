import { scorePath, type PathBar, type PathExit, type PathResult } from '../playbook/path-outcome';
import { defaultCostModel, roundTripCostRate } from '../playbook/costs';
import { horizonSessions, isCompleteHorizon } from '../playbook/walk-forward';
import { ymdOf } from '../date-ymd';
import { toFiniteNumber } from './numbers';
import type { Stance } from '../playbook/types';

export interface JournalPathInput {
  stance: Stance | string;
  asOf: string;
  entry: unknown;
  r1: unknown;
  max: unknown;
  invalidation: unknown;
  bars: Array<{ date: unknown; high: unknown; low: unknown; close: unknown }>;
}

const HORIZON = 5;

/**
 * Eligibility wrapper around canonical scorePath. Does not reimplement scoring.
 * Non-ENTER, incomplete N=5 horizon, or non-positive risk stay unscored.
 */
export function scoreJournalPath(input: JournalPathInput): PathResult {
  if (input.stance !== 'ENTER') return { unscored: true };

  const entry = toFiniteNumber(input.entry);
  const r1 = toFiniteNumber(input.r1);
  const max = toFiniteNumber(input.max);
  const invalidation = toFiniteNumber(input.invalidation);
  if (entry === null || r1 === null || max === null || invalidation === null) {
    return { unscored: true };
  }
  if (!(entry - invalidation > 0)) return { unscored: true };

  const bars: PathBar[] = [];
  for (const bar of input.bars) {
    const high = toFiniteNumber(bar.high);
    const low = toFiniteNumber(bar.low);
    const close = toFiniteNumber(bar.close);
    const date = ymdOf(bar.date);
    // Drop unusable bars instead of aborting the whole path. A garbage row
    // after the N=5 window must not unscore a complete horizon; a missing
    // required session still fails isCompleteHorizon below.
    if (high === null || low === null || close === null || !date) continue;
    bars.push({ date, high, low, close });
  }

  const forward = bars
    .filter((bar) => bar.date > input.asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
  const required = horizonSessions(input.asOf, HORIZON);
  if (!isCompleteHorizon(input.asOf, forward.map((bar) => bar.date), HORIZON)) {
    return { unscored: true };
  }

  const windowBars: PathBar[] = [];
  for (const date of required) {
    const bar = forward.find((candidate) => candidate.date === date);
    if (!bar) return { unscored: true };
    windowBars.push(bar);
  }

  return scorePath({
    entry,
    r1,
    max,
    invalidation,
    costRate: roundTripCostRate(defaultCostModel()),
    bars: windowBars,
  });
}

export type { PathExit, PathResult };
