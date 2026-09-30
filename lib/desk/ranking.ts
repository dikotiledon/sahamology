import type { Stance } from '../playbook/types';

/**
 * Frozen display rank for the daily desk (plan §5.1 / D3).
 *
 * Persistence is display-only and is deliberately absent from this map.
 * INVALIDATED is fixture-only: the live evaluator never emits it.
 */
export const STANCE_TIER = {
  ENTER: 0,
  WAIT: 1,
  TAKE_PROFIT: 2,
  INVALIDATED: 3,
  AVOID: 4,
} as const;

export type RankedStance = keyof typeof STANCE_TIER;

export interface DeskSortable {
  emiten: string;
  asOf: string;
  stance: Stance | string;
  rr: number | null;
}

function stanceRank(stance: string): number {
  return STANCE_TIER[stance as RankedStance] ?? 5;
}

/**
 * Total order: stance tier, then finite R:R descending (null/non-finite last
 * in-tier), then emiten, then asOf. Never returns NaN.
 */
export function compareDeskRows(a: DeskSortable, b: DeskSortable): number {
  const tier = stanceRank(String(a.stance)) - stanceRank(String(b.stance));
  if (tier !== 0) return tier;

  const aRr = a.rr !== null && Number.isFinite(a.rr) ? a.rr : null;
  const bRr = b.rr !== null && Number.isFinite(b.rr) ? b.rr : null;
  if (aRr !== null && bRr !== null && aRr !== bRr) return bRr - aRr;
  if (aRr !== null && bRr === null) return -1;
  if (aRr === null && bRr !== null) return 1;

  const names = a.emiten.localeCompare(b.emiten);
  if (names !== 0) return names;
  return a.asOf.localeCompare(b.asOf);
}

export function rankDeskRows<T extends DeskSortable>(items: readonly T[]): T[] {
  return [...items].sort(compareDeskRows);
}
