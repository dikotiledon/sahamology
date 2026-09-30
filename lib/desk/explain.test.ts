import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainRow, type StoredGate } from './explain';

const gates = (...rows: StoredGate[]): StoredGate[] => rows;

test('multi-gate failed ids each resolve to the stored reason', () => {
  const row = explainRow({
    stance: 'WAIT',
    failedGates: ['G1', 'G2'],
    gates: gates(
      { id: 'G0', pass: true, reason: 'ok' },
      { id: 'G1', pass: false, reason: 'Likuiditas menipis' },
      { id: 'G2', pass: false, reason: 'Spread terlalu lebar' },
    ),
  });
  assert.equal(row.unexplained, false);
  assert.deepEqual(
    row.explanations.map((e) => `${e.gateId}: ${e.reason}`),
    ['G1: Likuiditas menipis', 'G2: Spread terlalu lebar'],
  );
});

test('WAIT with empty failedGates is unexplained and carries a DEFECT explanation', () => {
  const row = explainRow({
    stance: 'WAIT',
    failedGates: [],
    gates: gates({ id: 'G4', pass: false, reason: 'Tren di bawah EMA-20' }),
  });
  assert.equal(row.unexplained, true);
  assert.equal(row.explanations.some((e) => e.gateId === 'DEFECT'), true);
});

test('a failedGates id with no matching stored reason is unexplained', () => {
  const row = explainRow({
    stance: 'AVOID',
    failedGates: ['G0', 'G9' as 'G0'],
    gates: gates({ id: 'G0', pass: false, reason: 'Tidak ada bandar' }),
  });
  assert.equal(row.unexplained, true);
});

test('ENTER is never unexplained even with empty failedGates', () => {
  const row = explainRow({
    stance: 'ENTER',
    failedGates: [],
    gates: gates({ id: 'G0', pass: true, reason: 'ok' }),
  });
  assert.equal(row.unexplained, false);
  assert.deepEqual(row.explanations, []);
});

test('TAKE_PROFIT with empty failedGates is explained, not a DEFECT', () => {
  const row = explainRow({
    stance: 'TAKE_PROFIT',
    failedGates: [],
    gates: gates({ id: 'G0', pass: true, reason: 'ok' }),
  });
  assert.equal(row.unexplained, false);
  assert.equal(row.explanations.some((e) => e.gateId === 'DEFECT'), false);
});

test('a reporting-only G5 row is not treated as a stance cause', () => {
  const row = explainRow({
    stance: 'WAIT',
    failedGates: ['G4'],
    gates: gates(
      { id: 'G4', pass: false, reason: 'Pola tidak di allow-list' },
      { id: 'G5', pass: false, reason: 'Ekuitas negatif', reportingOnly: true },
    ),
  });
  assert.equal(row.unexplained, false);
  assert.equal(row.explanations.some((e) => e.gateId === 'G5'), false);
  assert.equal(row.explanations[0]?.gateId, 'G4');
});
