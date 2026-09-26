/**
 * Serializes a playbook card into the decision_journal column contract.
 * Pure function — no DB access — so the POST body can be locked in tests.
 */

import type { PlaybookCard } from '../playbook';

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
  card: PlaybookCard
): JournalPayload {
  const cleanEmiten = emiten.trim().toUpperCase();
  if (!cleanEmiten) throw new Error('emiten is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('as_of must be YYYY-MM-DD');

  return {
    emiten: cleanEmiten,
    as_of: asOf,
    stance: card.stance,
    gates: card.gates.map((gate) => ({
      id: gate.id,
      pass: gate.pass,
      skipped: gate.skipped ?? false,
      reason: gate.reason,
    })),
    entry: card.entry,
    r1: card.r1,
    max: card.max,
    invalidation: card.invalidation,
    rr: card.rr,
    thesis: card.thesis,
    failed_gates: card.failedGates,
  };
}
