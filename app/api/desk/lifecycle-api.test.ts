import test from 'node:test';
import assert from 'node:assert/strict';
import { GET as getBattlePlan } from './battle-plan/route';
import { GET as getAbsorption } from '../radar/absorption/route';
import { POST as postExecutionAudit } from './execution-audit/route';

test('Lifecycle API route handlers are exported functions', () => {
  assert.equal(typeof getBattlePlan, 'function');
  assert.equal(typeof getAbsorption, 'function');
  assert.equal(typeof postExecutionAudit, 'function');
});
