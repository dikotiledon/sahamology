import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('app/api/macro/pressure/route.ts exports a GET handler', () => {
  const content = readFileSync(resolve(process.cwd(), 'app/api/macro/pressure/route.ts'), 'utf8');
  assert.match(content, /export async function GET/);
  assert.match(content, /evaluateMacroPressureState/);
  assert.match(content, /getLatestMacroPressure/);
});

test('app/api/desk/battle-plan/route.ts integrates macroOverlay and adjusted items', () => {
  const content = readFileSync(resolve(process.cwd(), 'app/api/desk/battle-plan/route.ts'), 'utf8');
  assert.match(content, /macroOverlay/);
  assert.match(content, /applyMacroOverlayToBattlePlan/);
  assert.match(content, /adjusted_v15m_shares/);
});

test('app/api/desk/execution-audit/route.ts accepts and saves execution tranches', () => {
  const content = readFileSync(resolve(process.cwd(), 'app/api/desk/execution-audit/route.ts'), 'utf8');
  assert.match(content, /tranches/);
  assert.match(content, /saveExecutionTranches/);
});
