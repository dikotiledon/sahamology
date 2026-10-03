import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/breadth returns daily market breadth metrics and regime classification', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/breadth');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.ok(typeof json.data.advancers === 'number');
  assert.ok(typeof json.data.decliners === 'number');
  assert.ok(typeof json.data.adRatio === 'number');
  assert.ok(typeof json.data.pctAboveSma50 === 'number');
  assert.ok(typeof json.data.marketRegime === 'string');
  assert.ok(typeof json.data.regimeScore === 'number');
  assert.ok(typeof json.data.advisory === 'string');
});

test('GET /api/radar/breadth?history=true returns breadth history records', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/breadth?history=true');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.history));
  assert.ok(json.history.length > 0);
});
