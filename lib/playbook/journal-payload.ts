/**
 * Serializes a playbook card into the decision_journal column contract.
 * Pure function — no DB access — so the POST body can be locked in tests.
 */

import type { PlaybookResult } from '../playbook';

export interface JournalPayload {
  emiten: string;
  as_of: string;
  stance: string;
  gates: unknown[];
  entry: number | null;
  r1: number | null;
  max: number | null;
  invalidation: number | null;
  rr: number | null;
  thesis: string;
  failed_gates: string[];
}

export function buildJournalPayload(
  emiten: string,
  asOf: string,
  card: PlaybookResult
): JournalPayload {
  const cleanEmiten = emiten.trim().toUpperCase();
  if (!cleanEmiten) throw new Error('emiten is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('as_of must be YYYY-MM-DD');

  const gates = [
    ...card.passedGates.map((id) => ({ id, pass: true })),
    ...card.failedGates.map((id) => ({ id, pass: false })),
  ];

  return {
    emiten: cleanEmiten,
    as_of: asOf,
    stance: card.stance,
    gates,
    entry: card.entryPrice,
    r1: card.targetR1,
    max: card.targetMax,
    invalidation: card.invalidation,
    rr: card.netRR,
    thesis: card.blockers.length > 0 ? card.blockers.join('; ') : `Semua gate lolos (${card.passedGates.join(',')})`,
    failed_gates: card.failedGates,
  };
}
