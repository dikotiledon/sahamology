import type { GateId, Stance } from '../playbook/types';

export const GATE_NAME: Record<GateId, string> = {
  G0: 'Integritas data / bandar',
  G1: 'Kualitas broker',
  G2: 'Buku order',
  G3: 'Risk-reward',
  G4: 'Tape',
  G5: 'Fundamental',
  G6: 'Kalender',
  G7: 'Regime makro',
};

export interface StoredGate {
  id: GateId | string;
  pass?: boolean;
  skipped?: boolean;
  reason?: string | null;
  reportingOnly?: boolean;
  micro?: unknown;
  fundamental?: unknown;
  macro?: unknown;
}

export interface GateExplanation {
  gateId: GateId | 'DEFECT';
  name: string;
  reason: string;
  reportingOnly?: boolean;
}

export interface ExplainInput {
  stance: Stance | string;
  failedGates: Array<GateId | string>;
  gates: StoredGate[];
}

export interface ExplainResult {
  unexplained: boolean;
  explanations: GateExplanation[];
}

function gateById(gates: StoredGate[], id: string): StoredGate | undefined {
  return gates.find((gate) => gate.id === id);
}

/**
 * unexplained ⇔ stance is WAIT/AVOID/INVALIDATED && (failedGates empty || any
 * id missing a stored reason). ENTER never needs a failed-gate reason.
 * TAKE_PROFIT is a closed-out management state (D4/D14) and is explained by
 * stance itself even when failedGates is empty. Reporting-only rows are
 * context, never a stance cause (plan D5).
 */
export function isUnexplained(input: ExplainInput): boolean {
  if (input.stance === 'ENTER' || input.stance === 'TAKE_PROFIT') return false;
  if (input.failedGates.length === 0) return true;
  return input.failedGates.some((id) => {
    const gate = gateById(input.gates, String(id));
    return !gate || !gate.reason;
  });
}

export function explainRow(input: ExplainInput): ExplainResult {
  const unexplained = isUnexplained(input);
  const explanations: GateExplanation[] = [];

  for (const id of input.failedGates) {
    const gate = gateById(input.gates, String(id));
    if (!gate || gate.reportingOnly) continue;
    if (!gate.reason) continue;
    explanations.push({
      gateId: gate.id as GateId,
      name: GATE_NAME[gate.id as GateId] ?? String(gate.id),
      reason: gate.reason,
    });
  }

  if (unexplained) {
    explanations.push({
      gateId: 'DEFECT',
      name: 'Defect',
      reason:
        input.failedGates.length === 0
          ? 'Stance non-ENTER tanpa failedGates — kartu tidak dapat dijelaskan dari gate tersimpan.'
          : 'Salah satu failedGates tidak punya reason tersimpan.',
    });
  }

  return { unexplained, explanations };
}
