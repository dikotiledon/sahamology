import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExecutionAudit, AuditInput } from './audit';

test('calculateExecutionAudit computes tick distance and slippage drag accurately', () => {
  const input: AuditInput = {
    plannedEntry: 2450, // tick size is 10
    executedEntry: 2480, // chased 3 ticks
    plannedR1: 2670,
    invalidationStop: 2330,
    lots: 77,
  };
  const audit = calculateExecutionAudit(input);
  assert.equal(audit.slippageTicks, 3);
  assert.equal(audit.slippagePct, 1.224);
  assert.ok(audit.adjustedNetRR < audit.theoreticalNetRR);
});

test('calculateExecutionAudit calculates realized PnL and execution efficiency when exit price is provided', () => {
  const input: AuditInput = {
    plannedEntry: 2450,
    executedEntry: 2460, // 1 tick slippage
    plannedR1: 2670,
    invalidationStop: 2330,
    lots: 10, // 1000 shares
    actualExitPrice: 2670, // reached R1
  };
  const audit = calculateExecutionAudit(input);
  assert.ok(audit.realizedPnl !== null);
  // Realized gross = (2670 - 2460) * 1000 = 210,000
  // Minus friction (buy 0.15% = 3690, sell 0.25% = 6675) -> net approx 199,635
  assert.ok(audit.realizedPnl > 195000 && audit.realizedPnl < 205000);
  assert.ok(audit.efficiencyRatio !== null);
  assert.ok(audit.efficiencyRatio <= 1.0); // slippage reduced efficiency slightly below 100%
});

test('calculateExecutionAudit flags SUBOPTIMAL_FILL when slippage degrades RR below 1.5', () => {
  const input: AuditInput = {
    plannedEntry: 2450,
    executedEntry: 2540, // severely chased entry (+90 pts)
    plannedR1: 2670,
    invalidationStop: 2330,
    lots: 50,
  };
  const audit = calculateExecutionAudit(input);
  assert.equal(audit.isSuboptimalFill, true);
});
