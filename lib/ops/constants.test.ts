import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { resolveStockbitTimeoutMs, STOCKBIT_TIMEOUT_MS } from './constants';

const original = process.env.STOCKBIT_TIMEOUT_MS;

afterEach(() => {
  if (original === undefined) delete process.env.STOCKBIT_TIMEOUT_MS;
  else process.env.STOCKBIT_TIMEOUT_MS = original;
});

test('resolveStockbitTimeoutMs clamps env and honors a finite positive override', () => {
  assert.equal(STOCKBIT_TIMEOUT_MS, 15_000);
  delete process.env.STOCKBIT_TIMEOUT_MS;
  assert.equal(resolveStockbitTimeoutMs(), 15_000);
  assert.equal(resolveStockbitTimeoutMs(undefined), 15_000);
  process.env.STOCKBIT_TIMEOUT_MS = '';
  assert.equal(resolveStockbitTimeoutMs(), 15_000);
  process.env.STOCKBIT_TIMEOUT_MS = '500';
  assert.equal(resolveStockbitTimeoutMs(), 15_000);
  process.env.STOCKBIT_TIMEOUT_MS = '1.5';
  assert.equal(resolveStockbitTimeoutMs(), 15_000);
  process.env.STOCKBIT_TIMEOUT_MS = '3000000000';
  assert.equal(resolveStockbitTimeoutMs(), 15_000);
  assert.equal(resolveStockbitTimeoutMs(20), 20);
});
