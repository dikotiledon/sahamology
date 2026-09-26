import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluatePlaybook } from './evaluate';
import { defaultCostModel } from './costs';
import type { PlaybookInput } from './types';
import type { CalculateTargetsOk } from '../calculations';

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
};

// G3 math for the base fixture:
//   entry = min(1000, 980) = 980
//   invalidation = min(900, 980 * 0.97 = 950.6) = 900
//   R = 80, rewardR1 = 1120 - 980 = 140
//   rrGross = 1.75, costInR = 980 * 0.006 / 80 = 0.0735 -> rr = 1.6765

test('healthy Smartmoney/Whale setup is ENTER with G4-G7 skipped', () => {
  const card = evaluatePlaybook(baseInput);
  assert.equal(card.stance, 'ENTER');
  assert.deepEqual(card.failedGates, []);
  for (const id of ['G4', 'G5', 'G6', 'G7']) {
    const gate = card.gates.find((g) => g.id === id);
    assert.equal(gate?.skipped, true);
    assert.equal(gate?.pass, true);
  }
  assert.equal(card.entry, 980);
  assert.equal(card.invalidation, 900);
  assert.ok((card.rr ?? 0) >= 1.5);
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

test('poor R:R is WAIT with G3 blocker', () => {
  const card = evaluatePlaybook({
    ...baseInput,
    calculated: { ...calcOk, targetRealistis1: 1080 },
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
