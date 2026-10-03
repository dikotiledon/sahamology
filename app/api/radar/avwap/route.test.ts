import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/avwap returns single emiten AVWAP assessment', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/avwap?emiten=BBRI');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'BBRI');
  assert.ok(json.data.baseAnchor !== undefined);
  assert.ok(typeof json.data.baseAnchor.vwap === 'number');
  assert.ok(typeof json.data.confluenceRegime === 'string');
  assert.ok(typeof json.data.regimeScore === 'number');
  assert.ok(typeof json.data.advisory === 'string');
});

test('GET /api/radar/avwap returns universe items list when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/avwap');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
});
