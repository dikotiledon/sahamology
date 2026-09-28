/**
 * Canonical playbook evaluator: gates G0–G3 decide ENTER/WAIT/AVOID, G4 is the
 * Phase 1 tape filter (fail-closed WAIT), and an already-open card can exit to
 * TAKE_PROFIT. G5–G7 exist in the card as skipped rows so the gate vocabulary
 * matches the accepted spec exactly.
 *
 * Subjective narration is forbidden: every non-ENTER stance names the exact
 * gate that blocked the trade and why.
 */

import { getFraksi } from '../calculations';
import { roundTripCostRate } from './costs';
import type { BrokerType } from '../brokers';
import type {
  GateId,
  GateResult,
  PlaybookCard,
  PlaybookInput,
  Stance,
  TapeView,
} from './types';

export type { PlaybookInput, PlaybookCard, Stance, GateId, GateResult } from './types';

const PHASE_1_SKIPPED_REASON = 'phase-1';

function skippedLaterGate(id: GateId): GateResult {
  return { id, pass: true, skipped: true, reason: PHASE_1_SKIPPED_REASON };
}

/** Round an invalidation toward the entry for a long (up to the tick). */
function roundTowardEntry(raw: number, fraksi: number): number {
  return Math.ceil(raw / fraksi) * fraksi;
}

function gate3Interim(input: PlaybookInput): { entry: number; invalidation: number } {
  const entry = Math.min(input.harga, input.rataRataBandar);
  const invalidation = Math.min(input.arb, input.rataRataBandar * 0.97);
  return { entry, invalidation };
}

/**
 * G3 reward/risk. When a finite ATR tape exists, the stop is
 * rataRataBandar - 1*ATR tick-rounded toward entry (Phase 1). Otherwise the
 * Phase 0 interim stop min(arb, bandar*0.97) applies.
 */
function evaluateGate3(input: PlaybookInput, r1: number | null) {
  const fraksi = getFraksi(input.harga);
  const tape = input.tape;
  const interim = gate3Interim(input);

  let entry = interim.entry;
  let invalidation = interim.invalidation;
  let invalidationSource: TapeView['invalidationSource'] = 'interim';

  if (tape && tape.ok && tape.atr !== null) {
    entry = interim.entry;
    const raw = input.rataRataBandar - 1 * tape.atr;
    invalidation = roundTowardEntry(raw, fraksi);
    invalidationSource = 'atr';
  }

  const risk = entry - invalidation;

  if (r1 === null) {
    return {
      pass: false,
      reason: 'Target Adi tidak tersedia (calc degenerate)',
      rr: null,
      entry,
      invalidation,
      invalidationSource,
      riskNonPositive: true,
    };
  }
  if (risk <= 0) {
    return {
      pass: false,
      reason: 'R tidak positif (entry <= invalidation)',
      rr: null,
      entry,
      invalidation,
      invalidationSource,
      riskNonPositive: true,
    };
  }

  const rewardR1 = r1 - entry;
  const rrGross = rewardR1 / risk;
  const costInR = (entry * roundTripCostRate(input.costs)) / risk;
  const rr = rrGross - costInR;

  if (!Number.isFinite(rr)) {
    return {
      pass: false,
      reason: 'R:R tidak terhingga',
      rr: null,
      entry,
      invalidation,
      invalidationSource,
      riskNonPositive: false,
    };
  }
  if (rr < 1.5) {
    return {
      pass: false,
      reason: `R:R bersih ${rr.toFixed(2)} di bawah 1.5 setelah biaya`,
      rr,
      entry,
      invalidation,
      invalidationSource,
      riskNonPositive: false,
    };
  }
  return {
    pass: true,
    reason: 'R:R bersih >= 1.5 setelah biaya',
    rr,
    entry,
    invalidation,
    invalidationSource,
    riskNonPositive: false,
  };
}

/** G4 tape filter. Missing/short tape is a WAIT-class failure, never AVOID. */
function evaluateGate4(input: PlaybookInput): GateResult {
  const tape = input.tape;

  if (!tape) {
    return {
      id: 'G4',
      pass: false,
      reason: 'Tape filter tidak tersedia (riwayat harga belum dimuat)',
    };
  }
  if (!tape.ok) {
    return { id: 'G4', pass: false, reason: tape.reason };
  }
  if (tape.trendOk) {
    return { id: 'G4', pass: true, reason: 'Tren 20-EMA tidak collapse' };
  }
  if (tape.pattern) {
    return { id: 'G4', pass: true, reason: `Reclaim ${tape.pattern} pada tren lemah` };
  }
  return { id: 'G4', pass: false, reason: 'Tape collapse tanpa spring/HL/BO-EMA' };
}

export function evaluatePlaybook(input: PlaybookInput): PlaybookCard {
  const gates: GateResult[] = [];
  const calcOk = input.calculated.ok;
  const r1 = calcOk ? input.calculated.targetRealistis1 : null;
  const max = calcOk ? input.calculated.targetMax : null;

  // ---------------------------------------------------------------- G0
  const adiFinite =
    calcOk &&
    r1 !== null &&
    max !== null &&
    Number.isFinite(r1) &&
    Number.isFinite(max) &&
    r1 > 0 &&
    max > 0 &&
    Number.isFinite(input.rataRataBandar) &&
    input.rataRataBandar > 0;

  let g0Reason: string;
  if (!calcOk) {
    g0Reason = 'Kalkulasi Adi degenerate';
  } else if (!input.isIdxSession) {
    g0Reason = 'Bukan sesi IDX (akhir pekan/libur)';
  } else if (!input.tokenValid) {
    g0Reason = 'Token Stockbit tidak valid';
  } else if (!adiFinite) {
    g0Reason = 'Output Adi tidak finit/positif';
  } else {
    g0Reason = 'Data lengkap dan valid';
  }
  const g0Pass = calcOk && input.isIdxSession && input.tokenValid && adiFinite;
  gates.push({ id: 'G0', pass: g0Pass, reason: g0Reason });

  // ---------------------------------------------------------------- G1
  const bandar = input.bandar?.trim() || null;
  const brokerType: BrokerType = input.brokerType;
  let g1Pass = false;
  let g1Reason: string;
  let g1Block = false; // AVOID-class failure (no bandar / Retail / Mix)
  let g1Wait = false; // WAIT-class failure (harga already above R1)
  let takeProfit = false;

  if (!bandar) {
    g1Block = true;
    g1Reason = 'Tidak ada akumulator teratas';
  } else if (brokerType !== 'Smartmoney' && brokerType !== 'Whale') {
    g1Block = true;
    g1Reason = `Akumulator teratas berkategori ${brokerType}`;
  } else if (r1 !== null && input.harga > r1) {
    if (input.openCard?.stance === 'ENTER') {
      takeProfit = true;
      g1Pass = true;
      g1Reason = 'Harga > R1 dengan kartu terbuka — ambil profit';
    } else {
      g1Wait = true;
      g1Reason = 'Harga sudah di atas R1 — kelola, jangan kejar';
    }
  } else {
    g1Pass = true;
    g1Reason = `Akumulator ${bandar} berkategori ${brokerType}`;
  }
  gates.push({ id: 'G1', pass: g1Pass, reason: g1Reason });

  // ---------------------------------------------------------------- G2
  let g2Pass = true;
  let g2Reason = 'Ruang menuju ARA memadai';
  if (input.harga >= input.ara) {
    g2Pass = false;
    g2Reason = 'Harga sudah di/near ARA — upside terbatas';
  } else if (input.totalOffer > 2 * input.totalBid) {
    g2Pass = false;
    g2Reason = 'Buku stacked di sisi offer (totalOffer > 2x totalBid)';
  }
  gates.push({ id: 'G2', pass: g2Pass, reason: g2Reason });

  // ---------------------------------------------------------------- G3
  const g3 = evaluateGate3(input, r1);
  gates.push({ id: 'G3', pass: g3.pass, reason: g3.reason });

  // ---------------------------------------------------------------- G4
  gates.push(evaluateGate4(input));

  // ---------------------------------------------------------------- G5-G7
  gates.push(skippedLaterGate('G5'));
  gates.push(skippedLaterGate('G6'));
  gates.push(skippedLaterGate('G7'));

  const failedGates = gates
    .filter((gate) => !gate.pass && !gate.skipped)
    .map((gate) => gate.id);

  // ------------------------------------------------------- stance
  let stance: Stance;
  if (!g0Pass) {
    stance = 'AVOID';
  } else if (takeProfit) {
    stance = 'TAKE_PROFIT';
  } else if (g1Block) {
    stance = 'AVOID';
  } else if (g1Wait) {
    stance = 'WAIT';
  } else if (!g2Pass) {
    stance = 'WAIT';
  } else if (!g3.pass) {
    stance = g3.riskNonPositive ? 'AVOID' : 'WAIT';
  } else if (!gates.find((g) => g.id === 'G4')!.pass) {
    stance = 'WAIT';
  } else {
    stance = 'ENTER';
  }

  // ------------------------------------------------------- thesis
  const firstFailure = gates.find((gate) => !gate.pass && !gate.skipped);
  let thesis: string;
  if (stance === 'ENTER') {
    thesis = 'G0–G4 lolos; G5–G7 skipped (phase-1).';
  } else if (stance === 'TAKE_PROFIT') {
    thesis = 'Harga telah mencapai R1 kartu terbuka — kelola posisi, jangan tambah.';
  } else {
    thesis = firstFailure ? `${firstFailure.id}: ${firstFailure.reason}.` : 'Tidak ada gate yang gagal.';
  }

  // Persistence note (G1 upgrade): same bandar in >=2 of last 3 prints.
  if (bandar && input.priorBandar.filter((code) => code === bandar).length >= 2) {
    thesis += ` Akumulator ${bandar} persisten (>=2 dari 3 print terakhir).`;
  }

  const tape: TapeView | undefined = input.tape
    ? {
        atr: input.tape.atr,
        ema20: input.tape.ema20,
        emaSlope: input.tape.ok
          ? input.tape.ema20 !== null && input.tape.ema20Prev !== null
            ? input.tape.ema20 >= input.tape.ema20Prev
              ? 'up'
              : 'down'
            : null
          : null,
        trendOk: input.tape.trendOk,
        pattern: input.tape.pattern,
        barsUsed: input.tape.barsUsed,
        invalidationSource: g3.invalidationSource,
      }
    : undefined;

  return {
    stance,
    gates,
    entry: calcOk ? g3.entry : null,
    r1,
    max,
    invalidation: calcOk ? g3.invalidation : null,
    rr: g3.rr,
    thesis,
    failedGates,
    tape,
  };
}
