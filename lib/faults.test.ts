import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { activeFaults, consumeFault, resetFaults } from './faults';

const originalEnv = process.env.NODE_ENV;
const originalFault = process.env.SAHAMOLOGY_FAULT;
const originalAllow = process.env.SAHAMOLOGY_FAULT_ALLOW;

function setNodeEnv(value: string | undefined): void {
  const env = process.env as { NODE_ENV?: string };
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
}

afterEach(() => {
  setNodeEnv(originalEnv);
  if (originalFault === undefined) delete process.env.SAHAMOLOGY_FAULT;
  else process.env.SAHAMOLOGY_FAULT = originalFault;
  if (originalAllow === undefined) delete process.env.SAHAMOLOGY_FAULT_ALLOW;
  else process.env.SAHAMOLOGY_FAULT_ALLOW = originalAllow;
  resetFaults();
});

test('production without ALLOW ignores faults', () => {
  setNodeEnv('production');
  delete process.env.SAHAMOLOGY_FAULT_ALLOW;
  process.env.SAHAMOLOGY_FAULT = 'stockbit-429';
  resetFaults();
  assert.equal(activeFaults().has('stockbit-429'), false);
});

test('ALLOW plus 429 is active; unknown names are ignored', () => {
  setNodeEnv('production');
  process.env.SAHAMOLOGY_FAULT_ALLOW = '1';
  process.env.SAHAMOLOGY_FAULT = 'stockbit-429,stockbit-hang,nope';
  resetFaults();
  assert.equal(activeFaults().has('stockbit-429'), true);
  assert.equal(activeFaults().has('stockbit-hang'), false);
  assert.equal(activeFaults().has('nope'), false);
});

test('consumeFault is true then false; resetFaults restores the env-derived set', () => {
  setNodeEnv('test');
  delete process.env.SAHAMOLOGY_FAULT_ALLOW;
  process.env.SAHAMOLOGY_FAULT = 'stockbit-429';
  resetFaults();
  assert.equal(consumeFault('stockbit-429'), true);
  assert.equal(consumeFault('stockbit-429'), false);
  resetFaults();
  assert.equal(activeFaults().has('stockbit-429'), true);
});
