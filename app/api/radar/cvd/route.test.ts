import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/cvd returns single emiten CVD assessment', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/cvd?emiten=BBRI');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'BBRI');
  assert.ok(json.data.cvd !== undefined);
  assert.ok(typeof json.data.cvd.cvd20d === 'number');
  assert.ok(typeof json.data.cvd.deltaRatioPct === 'number');
  assert.ok(json.data.aggression !== undefined);
  assert.ok(typeof json.data.aggression.aggressionRatio === 'number');
  assert.ok(typeof json.data.confluenceRegime === 'string');
  assert.ok(typeof json.data.convictionScore === 'number');
  assert.ok(typeof json.data.advisory === 'string');
});

test('GET /api/radar/cvd returns universe items list when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/cvd');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
});
