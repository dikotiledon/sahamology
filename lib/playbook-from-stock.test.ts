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
  assert.equal(input.bandarCode, 'BK');
  assert.equal(getBrokerInfo(input.bandarCode).type, 'Whale');
  assert.equal(input.harga, 1000);
  assert.equal(input.targetRealistis1, 1120);
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

test('null bandar folds to AVOID at evaluator (no throw)', () => {
  const input = playbookInputFromStock(
    'BBRI',
    { harga: 1000, ara: 1100, arb: 900, totalBid: 10000, totalOffer: 12000 },
    { bandar: '', barangBandar: 10000, rataRataBandar: 980 },
    calcOk
  );
  assert.equal(input.bandarCode, '');
});
