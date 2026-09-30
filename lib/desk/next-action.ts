import type { Stance } from '../playbook/types';

export type NextAction =
  | { kind: 'enter'; text: string; zoneLow: number; zoneHigh: number }
  | { kind: 'wait-pullback'; text: string; level: number }
  | { kind: 'manage'; text: string }
  | { kind: 'do-nothing'; text: string };

/**
 * Derived on the desk row, never on PlaybookCard (plan D14).
 * TAKE_PROFIT → manage. ENTER with finite entry/r1 → enter.
 * Every other non-ENTER → do-nothing.
 */
export function deriveNextAction(input: {
  stance: Stance | string;
  entry: number | null;
  r1: number | null;
  invalidation: number | null;
}): NextAction {
  if (input.stance === 'TAKE_PROFIT') {
    return { kind: 'manage', text: 'Kelola posisi, jangan tambah.' };
  }
  if (input.stance === 'ENTER') {
    if (
      input.entry !== null &&
      Number.isFinite(input.entry) &&
      input.r1 !== null &&
      Number.isFinite(input.r1)
    ) {
      return {
        kind: 'enter',
        text: 'Beli di zona entry menuju R1.',
        zoneLow: input.entry,
        zoneHigh: input.r1,
      };
    }
    return { kind: 'do-nothing', text: 'Angka entry/R1 tidak lengkap — jangan eksekusi.' };
  }
  return { kind: 'do-nothing', text: 'Jangan beli.' };
}
