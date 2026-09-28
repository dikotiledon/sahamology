import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPlaybookInputFromStock } from './from-stock';
import { defaultCostModel } from './costs';
import type { CalculateTargetsOk } from '../calculations';
import { getBrokerInfo } from '../brokers';

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

const base = {
  market: { harga: 1000, ara: 1100, arb: 900, totalBid: 10000, totalOffer: 12000 },
  broker: { bandar: 'BK', barangBandar: 10000, rataRataBandar: 980 },
  calculated: calcOk,
  priorRows: [] as Array<{ bandar?: string | null; from_date?: string | null }>,
  asOf: '2026-09-25',
  isIdxSession: true,
  tokenValid: true,
  costs: defaultCostModel(),
};

test('maps live stock context into the evaluator input', () => {
  const input = buildPlaybookInputFromStock(base);
  assert.equal(input.bandar, 'BK');
  assert.equal(input.brokerType, getBrokerInfo('BK').type);
  assert.equal(input.isIdxSession, true);
  assert.equal(input.tokenValid, true);
  assert.deepEqual(input.priorBandar, []);
});

test('prior rows are trimmed, skip today, newest 3 oldest-first', () => {
  const input = buildPlaybookInputFromStock({
    ...base,
    priorRows: [
      { bandar: 'YP', from_date: '2026-09-25' }, // today: excluded
      { bandar: 'BK', from_date: '2026-09-24' },
      { bandar: 'AN', from_date: '2026-09-23' },
      { bandar: 'BK', from_date: '2026-09-22' },
      { bandar: 'XX', from_date: '2026-09-21' }, // beyond last 3: dropped
    ],
  });
  assert.deepEqual(input.priorBandar, ['BK', 'AN', 'BK']);
});

test('null bandar folds to Mix and null bandar string', () => {
  const input = buildPlaybookInputFromStock({ ...base, broker: { bandar: '', barangBandar: 0, rataRataBandar: 0 } });
  assert.equal(input.bandar, null);
  assert.equal(input.brokerType, 'Mix');
});

test('session and token flags survive into the input', () => {
  const input = buildPlaybookInputFromStock({ ...base, isIdxSession: false, tokenValid: false });
  assert.equal(input.isIdxSession, false);
  assert.equal(input.tokenValid, false);
});

test('open card propagates', () => {
  const input = buildPlaybookInputFromStock({ ...base, openCard: { stance: 'ENTER' } });
  assert.deepEqual(input.openCard, { stance: 'ENTER' });
});

test('tape snapshot passes through unchanged when supplied', () => {
  const tape = {
    ok: true,
    reason: 'Tape valid',
    asOf: '2026-09-25',
    barsUsed: 21,
    atr: 20,
    ema20: 990,
    ema20Prev: 985,
    trendOk: true,
    pattern: null,
    completedDate: '2026-09-24',
  };
  const input = buildPlaybookInputFromStock({ ...base, tape });
  assert.deepEqual(input.tape, tape);
});
