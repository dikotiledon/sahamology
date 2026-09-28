import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluatePlaybook } from './evaluate';
import { defaultCostModel } from './costs';
import type { PlaybookInput } from './types';
import type { CalculateTargetsOk } from '../calculations';
import type { TapeSnapshot } from '../tape/snapshot';

const calcOk: CalculateTargetsOk = {
  ok: true,
  fraksi: 5,
  totalPapan: 40,
  rataRataBidOfer: 550,
  a: 49,
  p: 18,
  targetRealistis1: 1120,
  targetMax: 1180,
};

const tape = (over: Partial<TapeSnapshot> = {}): TapeSnapshot => ({
  ok: true,
  reason: 'Tape valid',
  asOf: '2026-09-24',
  barsUsed: 25,
  atr: 20,
  ema20: 990,
  ema20Prev: 985,
  trendOk: true,
  pattern: null,
  completedDate: '2026-09-24',
  ...over,
});

const baseInput: PlaybookInput = {
  harga: 1000,
  ara: 1100,
  arb: 900,
  totalBid: 10000,
  totalOffer: 12000,
  bandar: 'BK',
  barangBandar: 10000,
  rataRataBandar: 980,
  calculated: calcOk,
  brokerType: 'Whale',
  priorBandar: [],
  isIdxSession: true,
  tokenValid: true,
  costs: defaultCostModel(),
  tape: tape(),
};

// G3 math for the base fixture with ATR stop (atr=20, fraksi=5):
//   entry = min(1000, 980) = 980
//   invalidation = ceil((980 - 20)/5)*5 = ceil(960/5)*5 = 960
//   R = 20, rewardR1 = 1120 - 980 = 140
//   rrGross = 7, costInR = 980 * 0.006 / 20 = 0.294 -> rr = 6.706

// Phase 3 (D15): G5's skip label moved from 'phase-1' to 'phase-3-off',
// because G5 is now a designed, implemented gate that is deliberately not
// armed — not an unimplemented future placeholder like G6 and G7. G6 and G7
// keep 'phase-1'. The STANCE, the numbers and every G0-G4 assertion are
// unchanged: default-off means the card behaves exactly as it did in Phase 1.
test('healthy Smartmoney/Whale setup is ENTER with G4 live, G5-G7 skipped', () => {
  const card = evaluatePlaybook(baseInput);
  assert.equal(card.stance, 'ENTER');
  assert.deepEqual(card.failedGates, []);
  const g4 = card.gates.find((g) => g.id === 'G4');
  assert.equal(g4?.skipped, undefined);
  assert.equal(g4?.pass, true);
  // G5 reports 'phase-3-off'; G6 and G7 remain 'phase-1'.
  for (const id of ['G5', 'G6', 'G7']) {
    const gate = card.gates.find((g) => g.id === id);
    assert.equal(gate?.skipped, true);
    assert.equal(gate?.pass, true);
    assert.equal(gate?.reason, id === 'G5' ? 'phase-3-off' : 'phase-1');
  }
  assert.equal(card.entry, 980);
  assert.equal(card.invalidation, 960);
  assert.equal(card.tape?.invalidationSource, 'atr');
  assert.ok((card.rr ?? 0) >= 1.5);
});

test('ENTER thesis names G4, not phase-0 skip', () => {
  const card = evaluatePlaybook(baseInput);
  assert.equal(card.stance, 'ENTER');
  assert.match(card.thesis, /G0–G4 lolos/);
  assert.doesNotMatch(card.thesis, /phase-0/);
});

test('missing tape is WAIT with G4 blocker, never skipped', () => {
  const { tape: _drop, ...noTape } = baseInput;
  const card = evaluatePlaybook(noTape);
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G4'));
  const g4 = card.gates.find((g) => g.id === 'G4');
  assert.equal(g4?.skipped, undefined);
  assert.equal(g4?.pass, false);
});

test('replayG4Skipped re-enables Phase 0 semantics for the walk-forward only', () => {
  const { tape: _drop, ...noTape } = baseInput;
  const card = evaluatePlaybook({ ...noTape, replayG4Skipped: true });
  assert.equal(card.stance, 'ENTER'); // G0–G3 pass, G4 skipped
  const g4 = card.gates.find((g) => g.id === 'G4');
  assert.equal(g4?.skipped, true);
  assert.equal(g4?.pass, true);
  assert.equal(g4?.reason, 'phase-0');
});

test('tape.ok false is WAIT with G4 blocker', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    tape: tape({ ok: false, reason: 'Tape tidak cukup (10 sesi selesai, butuh 21)', atr: null, ema20: null, ema20Prev: null, trendOk: false, pattern: null }),
  });
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G4'));
});

test('collapsing tape with no pattern is WAIT with G4 blocker', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    tape: tape({ trendOk: false, pattern: null, reason: 'Tape collapse tanpa spring/HL/BO-EMA' }),
  });
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G4'));
});

test('collapsing tape with spring can ENTER if G0-G3 pass', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    tape: tape({ trendOk: false, pattern: 'spring' }),
  });
  assert.equal(card.stance, 'ENTER');
  const g4 = card.gates.find((g) => g.id === 'G4');
  assert.equal(g4?.pass, true);
  assert.match(g4?.reason ?? '', /spring/);
});

test('collapsing tape with break_prior_high can ENTER if G0-G3 pass', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    tape: tape({ trendOk: false, pattern: 'break_prior_high' }),
  });
  assert.equal(card.stance, 'ENTER');
  const g4 = card.gates.find((g) => g.id === 'G4');
  assert.equal(g4?.pass, true);
  assert.match(g4?.reason ?? '', /break_prior_high/);
});

test('ATR stop tightening risk below 1.5 flips an interim-ENTER to WAIT G3', () => {
  // Interim stop would be min(900, 950.6) = 900 → R = 80 → rr = 1.68 (ENTER).
  // ATR stop with atr=100: invalidation = ceil(880/5)*5 = 880 → R = 100 → rr = 1.34.
  const card = evaluatePlaybook({
    ...baseInput,
    tape: tape({ atr: 100 }),
  });
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G3'));
  assert.equal(card.invalidation, 880);
});

test('ATR stop with non-positive risk is AVOID G3', () => {
  // entry = min(970, 980) = 970; raw = 980 - 12 = 968; ceil(968/5)*5 = 970 → R = 0.
  const card = evaluatePlaybook({
    ...baseInput,
    harga: 970,
    tape: tape({ atr: 12 }),
  });
  assert.equal(card.stance, 'AVOID');
  assert.ok(card.failedGates.includes('G3'));
});

test('Mix / Retail broker is AVOID with G1 blocker', () => {
  const card = evaluatePlaybook({ ...baseInput, brokerType: 'Mix', bandar: 'ZZ' });
  assert.equal(card.stance, 'AVOID');
  assert.ok(card.failedGates.includes('G1'));
});

test('missing bandar is AVOID with G1 blocker', () => {
  const card = evaluatePlaybook({ ...baseInput, bandar: null, brokerType: 'Mix' });
  assert.equal(card.stance, 'AVOID');
  assert.ok(card.failedGates.includes('G1'));
});

test('harga at/near ARA is WAIT with G2 blocker', () => {
  const card = evaluatePlaybook({ ...baseInput, harga: 1100 });
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G2'));
});

test('offer-stacked book is WAIT with G2 blocker', () => {
  const card = evaluatePlaybook({ ...baseInput, totalOffer: 30000, totalBid: 10000 });
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G2'));
});

test('offer at 2.5x bid is WAIT (rule is >2x, not >3x)', () => {
  const card = evaluatePlaybook({ ...baseInput, totalOffer: 25000, totalBid: 10000 });
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G2'));
});

test('offer at 1.9x bid passes G2', () => {
  const card = evaluatePlaybook({ ...baseInput, totalOffer: 19000, totalBid: 10000 });
  assert.equal(card.gates.find((g) => g.id === 'G2')?.pass, true);
  assert.equal(card.stance, 'ENTER');
});

test('poor R:R is WAIT with G3 blocker', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    calculated: { ...calcOk, targetRealistis1: 1000 },
  });
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G3'));
});

test('non-positive risk is AVOID with G3 blocker', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    harga: 940,
    rataRataBandar: 1000,
    arb: 950,
  });
  assert.equal(card.stance, 'AVOID');
  assert.ok(card.failedGates.includes('G3'));
});

test('degenerate calc is AVOID with G0 blocker', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    calculated: { ok: false, reason: 'degenerate_book' },
  });
  assert.equal(card.stance, 'AVOID');
  assert.ok(card.failedGates.includes('G0'));
  assert.equal(card.entry, null);
});

test('non-IDX session is AVOID with G0 blocker', () => {
  const card = evaluatePlaybook({ ...baseInput, isIdxSession: false });
  assert.equal(card.stance, 'AVOID');
  assert.ok(card.failedGates.includes('G0'));
});

test('invalid token is AVOID with G0 blocker', () => {
  const card = evaluatePlaybook({ ...baseInput, tokenValid: false });
  assert.equal(card.stance, 'AVOID');
  assert.ok(card.failedGates.includes('G0'));
});

test('harga above R1 without open card is WAIT (G1)', () => {
  const card = evaluatePlaybook({ ...baseInput, harga: 1150, ara: 1300 });
  assert.equal(card.stance, 'WAIT');
  assert.ok(card.failedGates.includes('G1'));
});

test('harga above R1 with open ENTER card is TAKE_PROFIT', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    harga: 1150,
    ara: 1300,
    openCard: { stance: 'ENTER' },
  });
  assert.equal(card.stance, 'TAKE_PROFIT');
});

test('persistent bandar (>=2 of last 3) is noted in thesis, still ENTER', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    priorBandar: ['BK', 'BK', 'YP'],
  });
  assert.equal(card.stance, 'ENTER');
  assert.match(card.thesis, /persisten/);
});

test('chasing above bandar avg is NOT a G2 blocker when ARA room and R:R hold', () => {
  // The unauthorized old rule (harga > rataRataBandar * 1.05) must be gone.
  const card = evaluatePlaybook({ ...baseInput, harga: 1040 });
  assert.equal(card.stance, 'ENTER');
  assert.equal(card.gates.find((g) => g.id === 'G2')?.pass, true);
});
