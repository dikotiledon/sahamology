import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playbookInputFromStock } from './playbook-from-stock';
import type { CalculateTargetsOk } from '@/lib/calculations';
import { getBrokerInfo } from './brokers';

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

test('maps stock result into evaluator input', () => {
  const input = playbookInputFromStock(
    'BBRI',
    { harga: 1000, ara: 1100, arb: 900, totalBid: 10000, totalOffer: 12000 },
    { bandar: 'BK', barangBandar: 10000, rataRataBandar: 980 },
    calcOk
  );
  assert.equal(input.bandar, 'BK');
  assert.equal(input.brokerType, getBrokerInfo('BK').type);
  assert.equal(input.harga, 1000);
  assert.equal(input.calculated.ok, true);
});

test('degenerate calc rejects before evaluation', () => {
  assert.throws(
    () =>
      playbookInputFromStock(
        'BBRI',
        { harga: 1000, ara: 0, arb: 900, totalBid: 10000, totalOffer: 12000 },
        { bandar: 'BK', barangBandar: 10000, rataRataBandar: 980 },
        { ok: false, reason: 'degenerate_book' }
      ),
    /degenerate_book/
  );
});

test('null bandar folds to Mix at the mapper (no throw)', () => {
  const input = playbookInputFromStock(
    'BBRI',
    { harga: 1000, ara: 1100, arb: 900, totalBid: 10000, totalOffer: 12000 },
    { bandar: '', barangBandar: 10000, rataRataBandar: 980 },
    calcOk
  );
  assert.equal(input.bandar, null);
  assert.equal(input.brokerType, 'Mix');
});

test('extra context (token/session) survives into the input', () => {
  const input = playbookInputFromStock(
    'BBRI',
    { harga: 1000, ara: 1100, arb: 900, totalBid: 10000, totalOffer: 12000 },
    { bandar: 'BK', barangBandar: 10000, rataRataBandar: 980 },
    calcOk,
    { tokenValid: false, isIdxSession: false, priorBandar: ['BK', 'BK'] }
  );
  assert.equal(input.tokenValid, false);
  assert.equal(input.isIdxSession, false);
  assert.deepEqual(input.priorBandar, ['BK', 'BK']);
});
