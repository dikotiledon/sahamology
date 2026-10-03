import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/corporate-actions returns single emiten assessment', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/corporate-actions?emiten=PTBA');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'PTBA');
  assert.ok(json.data.dividend !== undefined);
  assert.ok(typeof json.data.dividend.dividendAmount === 'number');
  assert.ok(typeof json.data.dividend.dividendYieldPct === 'number');
  assert.ok(typeof json.data.dividend.dividendTrapScore === 'number');
  assert.ok(typeof json.data.confluenceRegime === 'string');
  assert.ok(typeof json.data.convictionScore === 'number');
  assert.ok(typeof json.data.advisory === 'string');
});

test('GET /api/radar/corporate-actions returns universe items list when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/corporate-actions');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
});
