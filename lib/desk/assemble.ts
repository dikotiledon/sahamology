import type { GateId, Stance } from '../playbook/types';
import type { PersistenceTier } from '../micro/types';
import type { PathExit } from '../playbook/path-outcome';
import type { EmitensSource, SkippedWatchlistItem, WatchlistUniverseItem } from '../jobs/watchlist-universe';
import { resolveEmitensToAnalyze } from '../jobs/watchlist-universe';
import { ymdOf } from '../date-ymd';
import { rankDeskRows, type DeskSortable } from './ranking';
import { explainRow, type GateExplanation, type StoredGate } from './explain';
import { deriveNextAction, type NextAction } from './next-action';
import { toFiniteNumber } from './numbers';

export const DESK_API_KEYS = ['date', 'morningCard', 'deskRows', 'skipped'] as const;

export interface DeskRow extends DeskSortable {
  emiten: string;
  asOf: string;
  stance: Stance;
  entry: number | null;
  r1: number | null;
  max: number | null;
  invalidation: number | null;
  rr: number | null;
  failedGates: GateId[];
  explanations: GateExplanation[];
  unexplained: boolean;
  nextAction: NextAction;
  persistenceTier: PersistenceTier | null;
  outcome: PathExit | null;
  rMultiple: number | null;
}

export interface MorningCardModel {
  date: string;
  enterCount: number;
  waitCount: number;
  avoidCount: number;
  takeProfitCount: number;
  unexplainedCount: number;
  pendingOutcomeCount: number;
  topEnter: Array<{ emiten: string; rr: number | null }>;
  topWait: Array<{ emiten: string; blockingGate: string; reason: string }>;
  skipped: SkippedWatchlistItem[];
  universeSource: EmitensSource;
  macroLabel: 'off' | 'NOT_EVALUATED' | 'NEUTRAL' | 'CAUTION' | 'absent';
}

export interface JournalDeskRecord {
  emiten: string;
  as_of: string;
  stance: Stance | string;
  entry?: unknown;
  r1?: unknown;
  max?: unknown;
  invalidation?: unknown;
  rr?: unknown;
  failed_gates?: unknown;
  gates?: unknown;
  outcome?: unknown;
  r_multiple?: unknown;
}

export interface AssembleInput {
  asOf: string;
  journals: JournalDeskRecord[];
  watchlistItems: readonly WatchlistUniverseItem[];
  fallbackEmitens: string | undefined | null;
}

export interface AssembleResult {
  date: string;
  morningCard: MorningCardModel;
  deskRows: DeskRow[];
  skipped: SkippedWatchlistItem[];
  apiEnvelopeKeys: typeof DESK_API_KEYS;
}

/** Wire shape of GET /api/desk `data` — compile-time keys, not a JSON field. */
export type DeskApiPayload = Pick<AssembleResult, (typeof DESK_API_KEYS)[number]>;

function asGateId(value: unknown): GateId | null {
  const id = String(value ?? '');
  return /^G[0-7]$/.test(id) ? (id as GateId) : null;
}

function asStoredGates(value: unknown): StoredGate[] {
  if (!Array.isArray(value)) return [];
  return value.map((gate) => {
    const rec = (gate ?? {}) as Record<string, unknown>;
    return {
      id: String(rec.id ?? ''),
      pass: Boolean(rec.pass),
      skipped: Boolean(rec.skipped),
      reason: rec.reason == null ? '' : String(rec.reason),
      reportingOnly: Boolean(rec.reportingOnly),
      micro: rec.micro,
      fundamental: rec.fundamental,
      macro: rec.macro,
    };
  });
}

function persistenceFromGates(gates: StoredGate[]): PersistenceTier | null {
  const g1 = gates.find((gate) => gate.id === 'G1');
  const micro = g1?.micro as { tier?: unknown } | undefined;
  const tier = micro?.tier;
  if (tier === 'persistent' || tier === 'building' || tier === 'spike') return tier;
  return null;
}

function macroLabelFromGates(gates: StoredGate[]): MorningCardModel['macroLabel'] {
  const g7 = gates.find((gate) => gate.id === 'G7');
  const macro = g7?.macro as { state?: unknown; g7Profile?: unknown } | undefined;
  if (!macro) return 'absent';
  if (macro.g7Profile === 'off') return 'off';
  if (macro.state === 'CAUTION' || macro.state === 'NEUTRAL' || macro.state === 'NOT_EVALUATED') {
    return macro.state;
  }
  return 'absent';
}

function isPathExit(value: unknown): value is PathExit {
  return value === 'invalidation' || value === 'max' || value === 'r1' || value === 'expiry';
}

function toDeskRow(journal: JournalDeskRecord): DeskRow | null {
  const emiten = String(journal.emiten ?? '').trim().toUpperCase();
  if (!emiten) return null;
  const stance = String(journal.stance ?? '') as Stance;
  const gates = asStoredGates(journal.gates);
  const failedGates = (Array.isArray(journal.failed_gates) ? journal.failed_gates : [])
    .map(asGateId)
    .filter((id): id is GateId => id !== null);
  const explained = explainRow({ stance, failedGates, gates });
  const entry = toFiniteNumber(journal.entry);
  const r1 = toFiniteNumber(journal.r1);
  const rr = toFiniteNumber(journal.rr);
  return {
    emiten,
    asOf: ymdOf(journal.as_of),
    stance,
    entry,
    r1,
    max: toFiniteNumber(journal.max),
    invalidation: toFiniteNumber(journal.invalidation),
    rr,
    failedGates,
    explanations: explained.explanations,
    unexplained: explained.unexplained,
    nextAction: deriveNextAction({ stance, entry, r1, invalidation: toFiniteNumber(journal.invalidation) }),
    persistenceTier: persistenceFromGates(gates),
    outcome: isPathExit(journal.outcome) ? journal.outcome : null,
    rMultiple: toFiniteNumber(journal.r_multiple),
  };
}

/**
 * Journal rows → ranked desk. Universe comes from resolveEmitensToAnalyze;
 * non-IDX names are skipped with reason and never ranked (plan D1).
 */
export function assembleDesk(input: AssembleInput): AssembleResult {
  const resolved = resolveEmitensToAnalyze(input.watchlistItems, input.fallbackEmitens);
  const skippedCodes = new Set(
    resolved.skipped.filter((item) => item.reason === 'non-idx').map((item) => item.symbol),
  );

  const deskRows = rankDeskRows(
    input.journals
      .map(toDeskRow)
      .filter((row): row is DeskRow => row !== null && !skippedCodes.has(row.emiten)),
  );

  const enter = deskRows.filter((row) => row.stance === 'ENTER');
  const wait = deskRows.filter((row) => row.stance === 'WAIT');
  const avoid = deskRows.filter((row) => row.stance === 'AVOID');
  const takeProfit = deskRows.filter((row) => row.stance === 'TAKE_PROFIT');

  const morningCard: MorningCardModel = {
    date: input.asOf,
    enterCount: enter.length,
    waitCount: wait.length,
    avoidCount: avoid.length,
    takeProfitCount: takeProfit.length,
    unexplainedCount: deskRows.filter((row) => row.unexplained).length,
    pendingOutcomeCount: enter.filter((row) => row.outcome === null).length,
    topEnter: enter.slice(0, 5).map((row) => ({ emiten: row.emiten, rr: row.rr })),
    topWait: wait.slice(0, 5).map((row) => ({
      emiten: row.emiten,
      blockingGate: row.explanations[0]?.gateId === 'DEFECT' ? 'DEFECT' : (row.explanations[0]?.gateId ?? 'DEFECT'),
      reason: row.explanations[0]?.reason ?? 'Tidak ada reason tersimpan.',
    })),
    skipped: resolved.skipped,
    universeSource: resolved.source,
    macroLabel: deskRows.reduce<MorningCardModel['macroLabel']>((label, row) => {
      if (label === 'CAUTION') return label;
      const gates = asStoredGates(input.journals.find((j) => j.emiten === row.emiten)?.gates);
      const next = macroLabelFromGates(gates);
      if (next === 'CAUTION') return next;
      if (label === 'absent') return next;
      return label;
    }, 'absent'),
  };

  return {
    date: input.asOf,
    morningCard,
    deskRows,
    skipped: resolved.skipped,
    apiEnvelopeKeys: DESK_API_KEYS,
  };
}

/**
 * Display filter for D4: AVOID is default-hidden behind a toggle.
 * TAKE_PROFIT stays visible. INVALIDATED is fixture-only and remains visible.
 */
export function visibleDeskRows<T extends { stance: string }>(
  rows: readonly T[],
  showAvoid: boolean,
): T[] {
  if (showAvoid) return [...rows];
  return rows.filter((row) => row.stance !== 'AVOID');
}
