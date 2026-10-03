import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/volume-profile returns volume profile for emiten', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/volume-profile?emiten=BBRI&lookback=20');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data !== undefined);
  assert.equal(json.data.emiten, 'BBRI');
  assert.ok(typeof json.data.pocPrice === 'number');
  assert.ok(typeof json.data.vahPrice === 'number');
  assert.ok(typeof json.data.valPrice === 'number');
  assert.ok(Array.isArray(json.data.bins));
});

test('GET /api/radar/volume-profile evaluates confluence when plannedEntry is provided', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/volume-profile?emiten=BBRI&plannedEntry=5000');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.confluence !== undefined);
  assert.ok(typeof json.confluence.status === 'string');
  assert.ok(typeof json.confluence.summary === 'string');
});

test('GET /api/radar/volume-profile returns empty items array when emiten is omitted', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/volume-profile');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.items));
});
