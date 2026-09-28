import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReplayInput } from './replay';

const signal = {
  emiten: 'BBRI',
  from_date: '2026-09-24',
  harga: 1000,
  ara: 1100,
  arb: 900,
  total_bid: 10000,
  total_offer: 12000,
  bandar: 'BK',
  barang_bandar: 10000,
  rata_rata_bandar: 980,
  target_realistis: 1120,
  target_max: 1180,
};

test('complete signal row maps to a scorable replay input', () => {
  const input = buildReplayInput(signal, ['BK', 'AN']);
  assert.ok(input !== null);
  if (input) {
    assert.equal(input.harga, 1000);
    assert.equal(input.ara, 1100);
    assert.equal(input.arb, 900);
    assert.equal(input.totalBid, 10000);
    assert.equal(input.totalOffer, 12000);
    assert.equal(input.bandar, 'BK');
    assert.equal(input.barangBandar, 10000);
    assert.equal(input.rataRataBandar, 980);
    assert.deepEqual(input.priorBandar, ['BK', 'AN']);
    assert.equal(input.isIdxSession, true); // 2026-09-24 is a Thursday
    assert.equal(input.tokenValid, true);
  }
});

test('missing book columns yield unscored (null), not guessed', () => {
  const input = buildReplayInput({ ...signal, total_bid: null }, []);
  assert.equal(input, null);
});

test('null bandar code folds to unscored for the G1 gate', () => {
  const input = buildReplayInput({ ...signal, bandar: null }, []);
  assert.ok(input !== null);
  if (input) {
    assert.equal(input.bandar, null);
    assert.equal(input.brokerType, 'Mix');
  }
});

test('weekend signal date is not an IDX session', () => {
  const input = buildReplayInput({ ...signal, from_date: '2026-09-26' }, []);
  assert.ok(input !== null);
  if (input) {
    assert.equal(input.isIdxSession, false); // Saturday
  }
});
