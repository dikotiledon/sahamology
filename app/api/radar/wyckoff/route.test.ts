import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/wyckoff returns single emiten Wyckoff assessment', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/wyckoff?emiten=BBRI');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'BBRI');
  assert.ok(typeof json.data.phase === 'string');
  assert.ok(typeof json.data.confidenceScore === 'number');
});

test('GET /api/radar/wyckoff returns universe items list when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/wyckoff');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
});
