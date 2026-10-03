import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/orb returns single emiten Opening Range assessment', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/orb?emiten=BBRI');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'BBRI');
  assert.ok(json.data.ib15 !== undefined);
  assert.ok(typeof json.data.ib15.high === 'number');
  assert.ok(typeof json.data.ib15.low === 'number');
  assert.ok(typeof json.data.ib15.range === 'number');
  assert.ok(typeof json.data.dayType === 'string');
  assert.ok(typeof json.data.confluenceRegime === 'string');
  assert.ok(typeof json.data.convictionScore === 'number');
  assert.ok(typeof json.data.advisory === 'string');
});

test('GET /api/radar/orb returns universe items list when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/orb');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
});
