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
import type { FundamentalInput, FundamentalView, G5Profile } from '../fundamentals/types';
import type { G7Profile, MacroInput, MacroView } from '../macro/types';
import type {
  GateId,
  GateResult,
  MicroView,
  PlaybookCard,
  PlaybookInput,
  Stance,
  TapeView,
} from './types';

export type { PlaybookInput, PlaybookCard, Stance, GateId, GateResult } from './types';

const PHASE_1_SKIPPED_REASON = 'phase-1';
/** G6 is an unimplemented future gate; it keeps the Phase 1 label. */
const PHASE_3_OFF_REASON = 'phase-3-off';
/** G7 is off by default: absent or 'off' means the regime is not consulted. */
const PHASE_4_OFF_REASON = 'phase-4-off';

function skippedLaterGate(id: GateId): GateResult {
  return { id, pass: true, skipped: true, reason: PHASE_1_SKIPPED_REASON };
}

/**
 * G7 — the macro-regime gate (Phase 4).
 *
 * A SINGLE-NOTCH HOLD, not a veto and not a filter. Two properties are the
 * whole design, and both are load-bearing:
 *
 *   It can only DOWNGRADE ENTER to WAIT. It never creates an ENTER, never
 *   softens a WAIT, and never reaches AVOID. A macro CAUTION says the broad
 *   backdrop is hostile; it says nothing about whether THIS emiten's thesis is
 *   broken. Demoting to AVOID would delete a setup that the structural,
 *   flow, tape and fundamental gates all passed, and would make a day of broad
 *   weakness indistinguishable from a dead thesis.
 *
 *   It FAILS OPEN. No macro snapshot, an incomplete capture, or an unarmed
 *   threshold all yield NOT_EVALUATED and a passing row. This is the same
 *   reasoning as G5 and the opposite of G4: a missing external read is an
 *   absence of evidence, and failing closed on it would quietly delete valid
 *   trades every time the vendor had a bad day.
 *
 * Under 'visible' the CAUTION is reported but cannot act — the operator sees a
 * regime warning coming without the gate touching the stance. Only the fully
 * armed 'veto' profile may downgrade, and even then only by one notch.
 */
function evaluateGate7(input: PlaybookInput): GateResult {
  const profile: G7Profile = input.g7Profile ?? 'off';
  if (profile === 'off') {
    return { id: 'G7', pass: true, skipped: true, reason: PHASE_4_OFF_REASON };
  }

  const macro: MacroInput | undefined = input.macro;
  if (!macro || macro.state === 'NOT_EVALUATED') {
    // Includes every unmeasured case: no snapshot, too few bars, no threshold
    // armed, or a sector with no commodity mapping. None of them is a warning.
    return {
      id: 'G7',
      pass: true,
      reason: 'Regime makro tidak dievaluasi (gagal open)',
    };
  }

  if (macro.state === 'CAUTION') {
    const clauses = macro.clauses.join(', ');
    if (profile === 'veto') {
      return {
        id: 'G7',
        pass: false,
        reason: `Regime perlu diwaspadai: ${clauses}`,
      };
    }
    return {
      id: 'G7',
      pass: false,
      reason: `Regime CAUTION (hanya tampilan): ${clauses}`,
    };
  }

  if (macro.state === 'NEUTRAL') {
    return { id: 'G7', pass: true, reason: 'Regime netral — tidak ada klausa terpicu' };
  }

  return { id: 'G7', pass: true, reason: 'Regime mendukung' };
}

/**
 * G5 — the fundamental-health veto (Phase 3).
 *
 * A VETO, never a filter: this function can only report a failure, and only
 * for a measured LANDMINE. It is deliberately unable to promote a setup,
 * soften a WAIT, or rescue an AVOID — the stance logic below consumes it in
 * one direction only.
 *
 * It FAILS OPEN, which is the opposite of G4. G4 fails closed because a setup
 * with no tape cannot be judged as a trend. A fundamental reading is
 * supplementary evidence, and its absence is not itself a red flag: a missing
 * snapshot means NOT_EVALUATED, never a veto. A veto firing on absent data
 * would be indistinguishable from a real finding, and would quietly delete
 * trades during a vendor outage.
 *
 * Under 'visible' the row still reports the finding, so an operator can see a
 * landmine coming without the gate acting on it.
 */
function evaluateGate5(input: PlaybookInput): GateResult {
  const profile: G5Profile = input.g5Profile ?? 'off';
  if (profile === 'off') {
    return { id: 'G5', pass: true, skipped: true, reason: PHASE_3_OFF_REASON };
  }

  const fundamental: FundamentalInput | undefined = input.fundamental;
  if (!fundamental || fundamental.state !== 'LANDMINE') {
    // Includes every unmeasured case: no snapshot, an empty one, a financial
    // issuer, or a reading that passed. None of them is a veto.
    return {
      id: 'G5',
      pass: true,
      reason:
        fundamental?.state === 'SOUND'
          ? 'Fundamental sehat — tidak ada veto'
          : 'Fundamental tidak dievaluasi (gagal open)',
    };
  }

  const clauses = fundamental.clauses.join(', ');
  return {
    id: 'G5',
    pass: false,
    reason: `Fundamental bermasalah: ${clauses}`,
  };
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
  if (input.replayG4Skipped) {
    return { id: 'G4', pass: true, skipped: true, reason: 'phase-0' };
  }
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
  let g1Wait = false; // WAIT-class failure (harga already above R1 / spike tier)
  let takeProfit = false;

  // Phase 2 profile. D0/D1: absent is 'phase-1', and under 'phase-1' the micro
  // snapshot is not consulted at all, so the card is byte-identical to Phase 1.
  const g1Profile = input.g1Profile === 'phase-2' ? 'phase-2' : 'phase-1';
  const micro = g1Profile === 'phase-2' ? input.micro : undefined;

  if (!bandar) {
    g1Block = true;
    g1Reason = 'Tidak ada akumulator teratas';
  } else if (brokerType !== 'Smartmoney' && brokerType !== 'Whale') {
    // Step 2 runs BEFORE any micro rule: a `Mix` fold already AVOIDs on this
    // stronger, already-shipped rule (plan §5.4 order, fixture 3).
    g1Block = true;
    g1Reason = `Akumulator teratas berkategori ${brokerType}`;
  } else if (micro && micro.tier === 'spike') {
    // Step 3 (D7): a one-day print is WAIT-class — the thesis is alive and
    // needs a second day. It is deliberately NOT AVOID, which the brief
    // reserves for a dead thesis.
    g1Wait = true;
    g1Reason = 'Bandar baru satu print — tunggu konfirmasi hari kedua';
  } else if (micro && micro.flowState === 'bad') {
    // Step 4 (D9): the same broker is a net seller on this very session.
    // `flowState` only returns 'bad' when the broker_seen_in_detector
    // cross-check passed, so an absent broker cannot land here.
    g1Block = true;
    g1Reason = 'Bandar yang sama kini net seller di sesi yang sama';
  } else if (micro && micro.accdistState === 'DIST') {
    // Step 5 (D8): only an unambiguous distribution blocks. SMALL_DIST is a
    // weaker signal and is annotated instead (Option F rejected).
    g1Block = true;
    g1Reason = 'Distribusi jelas pada akumulator teratas';
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

  // Annotations: the non-blocking micro readings are cited on the passing card
  // so the operator can see WHY the tier/flow were acceptable (D15).
  if (g1Pass && micro) {
    const notes: string[] = [];
    if (micro.tier === 'building') notes.push('persistensi 2 print');
    if (micro.tier === 'persistent') notes.push('persistensi ≥3 print');
    if (micro.flowState === 'ok') notes.push('alur bandar net buyer');
    if (notes.length > 0) g1Reason = `${g1Reason} (${notes.join('; ')})`;
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
  // D1: absent is 'off'. Independent of g1Profile by design, so a micro-profile
  // flip can never change what the fundamental veto does.
  const g5Profile: G5Profile = input.g5Profile ?? 'off';
  // G5 and G7 are evaluated LAST (D4). An earlier failure means each is skipped
  // below, so a technical rejection is never attributed to fundamentals or to
  // the macro backdrop.
  gates.push(evaluateGate5(input));
  gates.push(skippedLaterGate('G6'));
  const g7Profile: G7Profile = input.g7Profile ?? 'off';
  gates.push(evaluateGate7(input));

  // D4: G5 is only meaningful once G0–G4 have passed. If an earlier gate
  // already rejected the setup, the G5 row is marked skipped so the card never
  // blames fundamentals for what was a technical rejection — and so
  // `failedGates` names the real cause.
  // A gate that is only REPORTING is not a failure. G5 and G7 both report
  // without acting under 'visible', so neither may appear in `failedGates`:
  // that list names the reasons the stance is what it is, and under 'visible'
  // the stance is unaffected.
  const isReportingOnly = (gate: GateResult): boolean =>
    (gate.id === 'G5' && g5Profile !== 'veto') || (gate.id === 'G7' && g7Profile !== 'veto');

  const g5Row = gates.find((gate) => gate.id === 'G5')!;
  const earlierFailure = gates.some(
    (gate) => gate.id !== 'G5' && gate.id !== 'G7' && !gate.pass && !gate.skipped,
  );
  if (earlierFailure && !g5Row.skipped) {
    gates[gates.indexOf(g5Row)] = {
      id: 'G5',
      pass: true,
      skipped: true,
      reason: 'Dilewati karena gate sebelumnya gagal',
    };
  }
  // Same rule for G7: a CAUTION regime must never be cited as the reason a
  // setup failed on the tape. The G7 row is skipped, not removed, so the card
  // still shows that a regime reading existed.
  const g7Row = gates.find((gate) => gate.id === 'G7')!;
  // `isReportingOnly` is load-bearing here: under 'visible' G7 reports
  // pass:false, and without the exemption it would skip ITSELF, destroying the
  // very finding the operator asked to see.
  const failureBeforeG7 = gates.some(
    (gate) => gate.id !== 'G7' && !gate.pass && !gate.skipped && !isReportingOnly(gate),
  );
  if (failureBeforeG7 && !g7Row.skipped) {
    gates[gates.indexOf(g7Row)] = {
      id: 'G7',
      pass: true,
      skipped: true,
      reason: 'Dilewati karena gate sebelumnya gagal',
    };
  }

  // A gate that is only REPORTING (profile 'visible') is not a failure. It
  // must not appear in `failedGates`, because that list names the reasons the
  // stance is what it is, and under 'visible' the stance is unaffected.
  const failedGates = gates
    .filter((gate) => !gate.pass && !gate.skipped && !isReportingOnly(gate))
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
  } else if (g5Profile === 'veto' && !gates.find((g) => g.id === 'G5')!.pass) {
    // D3: monotonic downgrade only. This branch is reachable ONLY from ENTER,
    // because every earlier branch has already returned. G5 therefore cannot
    // create an ENTER, soften a WAIT, or rescue an AVOID — it can only turn an
    // otherwise-valid setup into AVOID.
    //
    // The `veto` guard is load-bearing: under 'visible' the gate row still
    // REPORTS the landmine (so an operator can see it coming) but must not
    // change the stance. Only the fully-armed profile may act.
    stance = 'AVOID';
  } else if (g7Profile === 'veto' && !gates.find((g) => g.id === 'G7')!.pass) {
    // D3: a CAUTION regime costs exactly ONE notch, and only from ENTER. This
    // branch is reachable only from ENTER because every earlier branch has
    // already returned, so G7 can never soften a WAIT, never rescue an AVOID,
    // and never create an ENTER. It downgrades to WAIT, never AVOID: a hostile
    // backdrop is not a broken thesis, and the setup is preserved on the card
    // for the operator to watch rather than deleted.
    stance = 'WAIT';
  } else {
    stance = 'ENTER';
  }

  // ------------------------------------------------------- thesis
  const firstFailure = gates.find(
    (gate) => !gate.pass && !gate.skipped && !isReportingOnly(gate),
  );
  let thesis: string;
  if (stance === 'ENTER') {
    // Name the gates that actually ran. Under Phase 4 an ENTER with the regime
    // evaluated must say so, otherwise the card looks identical to one produced
    // before the macro layer existed and an operator cannot tell which system
    // they are reading.
    const ranG5 = g5Profile !== 'off';
    const ranG7 = g7Profile !== 'off';
    const entered = ['G0–G4 lolos'];
    if (ranG5) entered.push('G5 fundamental lolos');
    if (ranG7) entered.push('G7 regime lolos');
    const skipped = ['G5', 'G6', 'G7'].filter((id) => {
      if (id === 'G5') return !ranG5;
      if (id === 'G7') return !ranG7;
      return true;
    });
    thesis = `${entered.join('; ')}. ${skipped.join(', ')} skipped.`;
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

  // Phase 2 micro view (D15). Present only when a snapshot was supplied under
  // the phase-2 profile. `accdistEvaluated` is false for UNKNOWN so the card
  // can say "tidak dievaluasi" instead of silently rendering a neutral badge.
  const microView: MicroView | undefined =
    g1Profile === 'phase-2' && input.micro
      ? {
          g1Profile,
          bandCode: input.micro.bandCode,
          tier: input.micro.tier,
          accdistState: input.micro.accdistState,
          accdistEvaluated:
            input.micro.accdistEvaluated !== undefined
              ? input.micro.accdistEvaluated
              : input.micro.accdistState !== 'UNKNOWN',
          flowState: input.micro.flowState,
        }
      : undefined;

  // Phase 3 fundamental view (D15). Recorded under EVERY profile, including
  // 'off' where it is inert. The card must be able to show that a fundamental
  // reading exists and that G5 is not currently armed, rather than leaving the
  // operator to infer it from a missing field.
  const fundamentalView: FundamentalView | undefined = input.fundamental
    ? { ...input.fundamental, g5Profile }
    : undefined;

  // Phase 4 macro view (D15). Recorded under EVERY profile, including 'off'
  // where it is inert. Same reason as `fundamental`: the card must be able to
  // show that a regime reading exists and that G7 is not currently armed,
  // rather than leaving the operator to infer it from a missing field.
  const macroView: MacroView | undefined = input.macro
    ? { ...input.macro, g7Profile }
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
    ...(microView ? { micro: microView } : {}),
    ...(fundamentalView ? { fundamental: fundamentalView } : {}),
    ...(macroView ? { macro: macroView } : {}),
  };
}
