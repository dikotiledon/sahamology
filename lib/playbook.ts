/**
 * Quantitative Playbook & Stance Evaluator (Phase 0 gates G0–G3).
 *
 * Consumes an already-calculated Adi Sucipto target set plus the raw orderbook
 * and broker identity, and returns one deterministic stance. Subjective
 * narration is forbidden: every non-ENTER stance names the exact gate that
 * blocked the trade and why.
 */

import { getBrokerInfo } from './brokers';

export type Stance = 'ENTER' | 'WAIT' | 'AVOID' | 'TAKE_PROFIT' | 'INVALIDATED';

export interface PlaybookInput {
  harga: number;
  ara: number;
  arb: number;
  fraksi: number;
  totalBid: number;
  totalOffer: number;
  totalPapan: number;
  rataRataBidOfer: number;
  rataRataBandar: number;
  barangBandar: number;
  bandarCode: string;
  targetRealistis1: number;
  targetMax: number;
}

export interface PlaybookResult {
  stance: Stance;
  passedGates: string[];
  failedGates: string[];
  blockers: string[];
  entryPrice: number;
  targetR1: number;
  targetMax: number;
  invalidation: number;
  netRR: number | null;
}

const IDX_FRICTION = 0.004;

function evaluateGate0(input: PlaybookInput): { passed: boolean; blocker?: string } {
  if (
    input.harga <= 0 ||
    input.ara <= 0 ||
    input.arb <= 0 ||
    input.fraksi <= 0 ||
    input.totalBid + input.totalOffer <= 0 ||
    input.totalPapan <= 0 ||
    input.rataRataBidOfer <= 0
  ) {
    return { passed: false, blocker: 'Buku order tidak valid / degenerate' };
  }
  if (input.ara <= input.arb) {
    return { passed: false, blocker: 'Rentang ARA-ARB tidak positif' };
  }
  return { passed: true };
}

function evaluateGate1(input: PlaybookInput): { passed: boolean; blocker?: string } {
  const info = getBrokerInfo(input.bandarCode);
  if (info.type !== 'Smartmoney' && info.type !== 'Whale') {
    return {
      passed: false,
      blocker: `Akumulator teratas berkategori ${info.type} (${info.code})`,
    };
  }
  return { passed: true };
}

function evaluateGate2(input: PlaybookInput): { passed: boolean; blocker?: string } {
  if (input.rataRataBandar <= 0) return { passed: true };
  if (input.harga > input.rataRataBandar * 1.05) {
    return {
      passed: false,
      blocker: 'Harga telah mengejar > 5% di atas avg bandar',
    };
  }
  return { passed: true };
}

function evaluateGate3(input: PlaybookInput): { passed: boolean; blocker?: string; netRR: number } {
  const invalidation = Math.max(input.arb, Math.round(input.rataRataBandar * 0.97));
  const gain = input.targetRealistis1 - input.harga;
  const risk = input.harga - invalidation;
  if (risk <= 0) {
    return { passed: false, blocker: 'Invaldasi tidak menyisakan risiko positif', netRR: 0 };
  }
  const friction = (input.harga + input.targetRealistis1) * IDX_FRICTION;
  const netRR = (gain - friction) / (risk + friction);
  if (netRR < 1.5) {
    return { passed: false, blocker: 'R:R bersih di bawah 1.5 setelah friksi', netRR };
  }
  return { passed: true, netRR };
}

export function evaluatePlaybook(input: PlaybookInput): PlaybookResult {
  const gates: Array<{ id: string; passed: boolean; blocker?: string }> = [
    { id: 'G0', ...evaluateGate0(input) },
    { id: 'G1', ...evaluateGate1(input) },
    { id: 'G2', ...evaluateGate2(input) },
  ];

  const invalidation = Math.max(input.arb, Math.round(input.rataRataBandar * 0.97));
  let netRR: number | null = null;
  const g3 = evaluateGate3(input);
  if (Number.isFinite(g3.netRR)) netRR = g3.netRR;
  gates.push({ id: 'G3', passed: g3.passed, blocker: g3.blocker });

  const failedGates = gates.filter((gate) => !gate.passed);
  const blockers = failedGates.map((gate) => `${gate.id}: ${gate.blocker}`);

  let stance: Stance;
  if (failedGates.some((gate) => gate.id === 'G0' || gate.id === 'G1')) {
    stance = 'AVOID';
  } else if (failedGates.length > 0) {
    stance = 'WAIT';
  } else {
    stance = 'ENTER';
  }

  return {
    stance,
    passedGates: gates.filter((gate) => gate.passed).map((gate) => gate.id),
    failedGates: failedGates.map((gate) => gate.id),
    blockers,
    entryPrice: input.harga,
    targetR1: input.targetRealistis1,
    targetMax: input.targetMax,
    invalidation,
    netRR,
  };
}
