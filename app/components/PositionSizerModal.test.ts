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
});
