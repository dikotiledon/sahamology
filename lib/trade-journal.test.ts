import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeJournalEntry, JournalInput } from './trade-journal';

const valid: JournalInput = {
  emiten: 'bbri',
  signalDate: '2026-09-25',
  stance: 'ENTER',
  entryPrice: 1000,
  targetRealistis: 1120,
  targetMax: 1180,
  invalidationPrice: 950,
  netRR: 2.1,
  bandarCode: 'BK',
  brokerType: 'Whale',
  blockers: [],
};

test('valid ENTER entry passes with canonicalized fields', () => {
  const result = normalizeJournalEntry(valid);
  assert.ok(result.ok);
  assert.equal(result.value?.emiten, 'BBRI');
  assert.equal(result.value?.signalDate, '2026-09-25');
});

test('invalid stance is rejected', () => {
  const result = normalizeJournalEntry({ ...valid, stance: 'BUY' as never });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /stance/i);
});

test('missing emiten is rejected', () => {
  const result = normalizeJournalEntry({ ...valid, emiten: '  ' });
  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /emiten/i);
});

test('negative prices are rejected', () => {
  const result = normalizeJournalEntry({ ...valid, entryPrice: -5 });
  assert.equal(result.ok, false);
});

test('non-ENTER stance may carry blockers', () => {
  const result = normalizeJournalEntry({
    ...valid,
    stance: 'WAIT',
    blockers: ['G2: Harga telah mengejar > 5% di atas avg bandar'],
  });
  assert.ok(result.ok);
  assert.equal(result.value?.blockers?.length, 1);
});
