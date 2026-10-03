import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('PositionSizerModal exports a valid React component structure', () => {
  const content = readFileSync(resolve(process.cwd(), 'app/components/PositionSizerModal.tsx'), 'utf8');
  assert.match(content, /export function PositionSizerModal/);
  assert.match(content, /calculatePositionSize/);
  assert.match(content, /recommendedLots/);
  assert.match(content, /allocatedCapital/);
  assert.match(content, /calculateTrancheSchedule/);
  assert.match(content, /trancheSchedule/);
});

test('BattlePlanCard integrates macro overlay banner and adjusted execution parameters', () => {
  const content = readFileSync(resolve(process.cwd(), 'app/components/BattlePlanCard.tsx'), 'utf8');
  assert.match(content, /macroOverlay/);
  assert.match(content, /MACRO_HEADWIND/);
  assert.match(content, /adjusted_invalidation_price/);
  assert.match(content, /adjusted_v15m_shares/);
});
