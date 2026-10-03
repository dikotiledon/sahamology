import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/mtf returns single emiten Multi-Timeframe assessment', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/mtf?emiten=BBRI');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'BBRI');
  assert.ok(json.data.weekly !== undefined);
  assert.ok(typeof json.data.weekly.stage === 'string');
  assert.ok(json.data.daily !== undefined);
  assert.ok(typeof json.data.daily.trendState === 'string');
  assert.ok(typeof json.data.alignmentRegime === 'string');
  assert.ok(typeof json.data.sizingMultiplier === 'number');
  assert.ok(typeof json.data.alignmentScore === 'number');
  assert.ok(typeof json.data.advisory === 'string');
});

test('GET /api/radar/mtf returns universe items list when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/mtf');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
  assert.ok(json.items.length > 0);
});
