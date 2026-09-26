import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildJournalPayload } from './journal-payload';
import type { PlaybookCard } from '../playbook';

const card: PlaybookCard = {
  stance: 'ENTER',
  gates: [
    { id: 'G0', pass: true, reason: 'ok' },
    { id: 'G1', pass: true, reason: 'ok' },
    { id: 'G4', pass: true, skipped: true, reason: 'phase-0' },
  ],
  entry: 1000,
  r1: 1120,
  max: 1180,
  invalidation: 950,
  rr: 2.1,
  thesis: 'G0–G3 lolos',
  failedGates: [],
};

test('payload serializes evaluator card into journal columns', () => {
  const payload = buildJournalPayload('bbri', '2026-09-25', card);
  assert.deepEqual(payload.emiten, 'BBRI');
  assert.deepEqual(payload.as_of, '2026-09-25');
  assert.deepEqual(payload.stance, 'ENTER');
  assert.deepEqual(payload.entry, 1000);
  assert.deepEqual(payload.r1, 1120);
  assert.deepEqual(payload.max, 1180);
  assert.deepEqual(payload.invalidation, 950);
  assert.deepEqual(payload.rr, 2.1);
  assert.deepEqual(payload.failed_gates, []);
  assert.deepEqual(payload.gates, [
    { id: 'G0', pass: true, skipped: false, reason: 'ok' },
    { id: 'G1', pass: true, skipped: false, reason: 'ok' },
    { id: 'G4', pass: true, skipped: true, reason: 'phase-0' },
  ]);
});

test('failed gates serialize into text[]', () => {
  const payload = buildJournalPayload('CPRO', '2026-09-25', {
    ...card,
    stance: 'AVOID',
    failedGates: ['G0', 'G1'],
    thesis: 'G0: degenerate; G1: Retail',
  });
  assert.deepEqual(payload.stance, 'AVOID');
  assert.deepEqual(payload.failed_gates, ['G0', 'G1']);
  assert.equal((payload.thesis as string).length > 0, true);
});

test('emiten and as_of are validated', () => {
  assert.throws(() => buildJournalPayload('  ', '2026-09-25', card), /emiten/);
  assert.throws(() => buildJournalPayload('BBRI', 'not-a-date', card), /as_of/);
});
