import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveNextAction } from './next-action';

test('TAKE_PROFIT nextAction is manage', () => {
  const action = deriveNextAction({ stance: 'TAKE_PROFIT', entry: 1000, r1: 1100, invalidation: 950 });
  assert.equal(action.kind, 'manage');
});

test('WAIT nextAction is do-nothing, never enter', () => {
  const action = deriveNextAction({ stance: 'WAIT', entry: 1000, r1: 1100, invalidation: 950 });
  assert.equal(action.kind, 'do-nothing');
});

test('AVOID nextAction is do-nothing', () => {
  const action = deriveNextAction({ stance: 'AVOID', entry: 1000, r1: 1100, invalidation: 950 });
  assert.equal(action.kind, 'do-nothing');
});

test('ENTER with finite entry and r1 is enter', () => {
  const action = deriveNextAction({ stance: 'ENTER', entry: 1000, r1: 1100, invalidation: 950 });
  assert.equal(action.kind, 'enter');
  if (action.kind === 'enter') {
    assert.equal(action.zoneLow, 1000);
    assert.equal(action.zoneHigh, 1100);
  }
});

test('ENTER with missing numbers is do-nothing', () => {
  const action = deriveNextAction({ stance: 'ENTER', entry: null, r1: 1100, invalidation: 950 });
  assert.equal(action.kind, 'do-nothing');
});
