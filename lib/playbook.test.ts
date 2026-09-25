import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluatePlaybook, PlaybookInput } from './playbook';

const baseInput: PlaybookInput = {
  harga: 1000,
  ara: 1100,
  arb: 900,
  fraksi: 5,
  totalBid: 10000,
  totalOffer: 12000,
  totalPapan: 40,
  rataRataBidOfer: 550,
  rataRataBandar: 980,
  barangBandar: 10000,
  bandarCode: 'BK',
  targetRealistis1: 1120,
  targetMax: 1180,
};

test('healthy Smartmoney setup with good R:R is ENTER', () => {
  const result = evaluatePlaybook(baseInput);
  assert.equal(result.stance, 'ENTER');
});

test('degenerate book is AVOID with G0 blocker', () => {
  const result = evaluatePlaybook({ ...baseInput, ara: 0 });
  assert.equal(result.stance, 'AVOID');
  assert.ok(result.failedGates.includes('G0'));
});

test('retail lead broker is AVOID with G1 blocker', () => {
  const result = evaluatePlaybook({ ...baseInput, bandarCode: 'YP' });
  assert.equal(result.stance, 'AVOID');
  assert.ok(result.failedGates.includes('G1'));
});

test('unknown broker folds to Mix and is rejected', () => {
  const result = evaluatePlaybook({ ...baseInput, bandarCode: 'ZZ' });
  assert.equal(result.stance, 'AVOID');
  assert.ok(result.failedGates.includes('G1'));
});

test('price chased above bandar avg by more than 5% is WAIT', () => {
  const result = evaluatePlaybook({ ...baseInput, harga: 1040 });
  assert.equal(result.stance, 'WAIT');
  assert.ok(result.failedGates.includes('G2'));
});

test('poor R:R is WAIT with G3 blocker', () => {
  const result = evaluatePlaybook({
    ...baseInput,
    harga: 1000,
    targetRealistis1: 1005,
    arb: 995,
    rataRataBandar: 998,
  });
  assert.equal(result.stance, 'WAIT');
  assert.ok(result.failedGates.includes('G3'));
});

test('ENTER carries explicit entry, targets, invalidation, net R:R', () => {
  const result = evaluatePlaybook(baseInput);
  assert.equal(result.entryPrice, 1000);
  assert.equal(result.targetR1, 1120);
  assert.equal(result.targetMax, 1180);
  assert.ok(result.invalidation > 0);
  assert.ok((result.netRR ?? 0) >= 1.5);
});
