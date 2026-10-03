import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST, GET } from './route';

test('POST /api/desk/cognitive-review audits trade discipline and calculates tilt state', async () => {
  const req = new NextRequest('http://localhost:3000/api/desk/cognitive-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emiten: 'BBRI',
      plannedEntry: 5000,
      realizedEntry: 5000,
      plannedStop: 4850,
      realizedExit: 5300,
      targetR1: 5300,
      plannedLots: 100,
      realizedLots: 100,
      psychologicalStateAtEntry: 'CALM',
    }),
  });

  const res = await POST(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.review);
  assert.equal(json.review.emiten, 'BBRI');
  assert.equal(json.review.disciplineScore, 100);
  assert.equal(json.review.grade, 'MASTER_DISCIPLINE');
  assert.ok(json.tilt);
  assert.equal(json.tilt.tiltState, 'NORMAL');
});

test('POST /api/desk/cognitive-review detects deviation and returns updated tilt state', async () => {
  const req = new NextRequest('http://localhost:3000/api/desk/cognitive-review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emiten: 'BBRI',
      plannedEntry: 5000,
      realizedEntry: 5125, // 5 ticks higher FOMO
      plannedStop: 4850,
      targetR1: 5300,
      plannedLots: 100,
      realizedLots: 150, // oversizing
      psychologicalStateAtEntry: 'ANXIOUS',
    }),
  });

  const res = await POST(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.review.disciplineScore < 70);
  assert.ok(json.review.deviations.length >= 2);
  assert.ok(['CAUTION', 'TILT_LOCKOUT'].includes(json.tilt.tiltState));
});

test('GET /api/desk/cognitive-review returns current tilt status and recent reviews', async () => {
  const req = new NextRequest('http://localhost:3000/api/desk/cognitive-review?emiten=BBRI&limit=5');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.tilt);
  assert.ok(Array.isArray(json.reviews));
});
