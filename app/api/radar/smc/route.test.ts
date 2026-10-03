import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/smc returns single emiten Smart Money assessment', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/smc?emiten=BBRI');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'BBRI');
  assert.ok(typeof json.data.marketStructure === 'string');
  assert.ok(typeof json.data.confluenceRegime === 'string');
  assert.ok(typeof json.data.regimeScore === 'number');
  assert.ok(typeof json.data.advisory === 'string');
});

test('GET /api/radar/smc returns universe items list when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/smc');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
});
