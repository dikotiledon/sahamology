import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

test('GET /api/radar/sectors/rotation returns active sectors with rotation metrics and quadrants', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/sectors/rotation');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.sectors));
  assert.ok(json.sectors.length > 0);

  const firstSector = json.sectors[0];
  assert.ok(typeof firstSector.sector === 'string');
  assert.ok(typeof firstSector.rsRatio === 'number');
  assert.ok(typeof firstSector.rsMomentum === 'number');
  assert.ok(typeof firstSector.netFlow5d === 'number');
  assert.ok(typeof firstSector.quadrant === 'string');
});

test('GET /api/radar/sectors/rotation?sector=Financials returns targeted confluence', async () => {
  const { GET } = await import('./route');
  const req = new NextRequest('http://localhost:3000/api/radar/sectors/rotation?sector=Financials');
  const res = await GET(req);
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.confluence !== undefined);
  assert.equal(json.confluence.sector.toLowerCase(), 'financials');
  assert.ok(typeof json.confluence.isTailwind === 'boolean');
  assert.ok(typeof json.confluence.isHeadwind === 'boolean');
  assert.ok(typeof json.confluence.summary === 'string');
});
