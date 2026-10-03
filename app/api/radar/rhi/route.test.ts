import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/rhi returns single emiten Retail Herd assessment', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/rhi?emiten=BBRI');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'BBRI');
  assert.ok(typeof json.data.rhiScore === 'number');
  assert.ok(json.data.retail !== undefined);
  assert.ok(typeof json.data.retail.retailNetBuyValue === 'number');
  assert.ok(json.data.syndicate !== undefined);
  assert.ok(typeof json.data.syndicate.syndicateAsymmetryRatio === 'number');
  assert.ok(typeof json.data.confluenceRegime === 'string');
  assert.ok(typeof json.data.convictionScore === 'number');
  assert.ok(typeof json.data.advisory === 'string');
});

test('GET /api/radar/rhi returns universe items list when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/rhi');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
});
