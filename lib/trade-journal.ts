/**
 * Trading journal persistence (migration 020).
 *
 * The journal is the audit trail for the decision engine: every stance emitted
 * by the playbook is normalized here before hitting PostgreSQL so invalid
 * states never enter the audit table.
 */

import { query } from './db';
import type { Stance } from './playbook';

export type JournalStance = Stance;

export interface JournalInput {
  emiten: string;
  signalDate: string;
  stance: string;
  entryPrice?: number | null;
  targetRealistis?: number | null;
  targetMax?: number | null;
  invalidationPrice?: number | null;
  netRR?: number | null;
  bandarCode?: string | null;
  brokerType?: string | null;
  blockers?: string[];
  notes?: string | null;
}

export interface NormalizedJournalEntry {
  emiten: string;
  signalDate: string;
  stance: JournalStance;
  entryPrice: number | null;
  targetRealistis: number | null;
  targetMax: number | null;
  invalidationPrice: number | null;
  netRR: number | null;
  bandarCode: string | null;
  brokerType: string | null;
  blockers: string[] | null;
  notes: string | null;
}

export type JournalValidationResult =
  | { ok: true; value: NormalizedJournalEntry }
  | { ok: false; error: string };

const VALID_STANCES: JournalStance[] = ['ENTER', 'WAIT', 'AVOID', 'TAKE_PROFIT', 'INVALIDATED'];

export function normalizeJournalEntry(input: JournalInput): JournalValidationResult {
  const emiten = input.emiten.trim().toUpperCase();
  if (!emiten) return { ok: false, error: 'emiten is required' };

  const signalDate = input.signalDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signalDate)) {
    return { ok: false, error: 'signalDate must be YYYY-MM-DD' };
  }

  if (!VALID_STANCES.includes(input.stance as JournalStance)) {
    return { ok: false, error: `invalid stance: ${input.stance}` };
  }

  const prices = [
    input.entryPrice,
    input.targetRealistis,
    input.targetMax,
    input.invalidationPrice,
  ];
  if (prices.some((price) => price !== null && price !== undefined && Number(price) < 0)) {
    return { ok: false, error: 'prices must be non-negative' };
  }

  return {
    ok: true,
    value: {
      emiten,
      signalDate,
      stance: input.stance as JournalStance,
      entryPrice: input.entryPrice ?? null,
      targetRealistis: input.targetRealistis ?? null,
      targetMax: input.targetMax ?? null,
      invalidationPrice: input.invalidationPrice ?? null,
      netRR: input.netRR ?? null,
      bandarCode: input.bandarCode ? input.bandarCode.toUpperCase() : null,
      brokerType: input.brokerType ?? null,
      blockers: input.blockers?.length ? input.blockers : null,
      notes: input.notes ?? null,
    },
  };
}

export async function upsertJournalEntry(input: JournalInput): Promise<void> {
  const result = normalizeJournalEntry(input);
  if (!result.ok) throw new Error(result.error);
  const entry = result.value;

  await query(
    `INSERT INTO trade_journal
       (emiten, signal_date, stance, entry_price, target_realistis, target_max,
        invalidation_price, net_rr, bandar_code, broker_type, blockers, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (emiten, signal_date) DO UPDATE SET
       stance = EXCLUDED.stance,
       entry_price = EXCLUDED.entry_price,
       target_realistis = EXCLUDED.target_realistis,
       target_max = EXCLUDED.target_max,
       invalidation_price = EXCLUDED.invalidation_price,
       net_rr = EXCLUDED.net_rr,
       bandar_code = EXCLUDED.bandar_code,
       broker_type = EXCLUDED.broker_type,
       blockers = EXCLUDED.blockers,
       notes = EXCLUDED.notes,
       updated_at = NOW()`,
    [
      entry.emiten,
      entry.signalDate,
      entry.stance,
      entry.entryPrice,
      entry.targetRealistis,
      entry.targetMax,
      entry.invalidationPrice,
      entry.netRR,
      entry.bandarCode,
      entry.brokerType,
      entry.blockers,
      entry.notes,
    ]
  );
}

export async function recordJournalExit(
  id: number,
  exitPrice: number,
  exitReason: string,
  netPnl: number,
  exitDate: string
): Promise<void> {
  await query(
    `UPDATE trade_journal
     SET exit_price = $2, exit_reason = $3, net_pnl = $4, exit_date = $5, updated_at = NOW()
     WHERE id = $1`,
    [id, exitPrice, exitReason, netPnl, exitDate]
  );
}
