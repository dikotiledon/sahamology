import test from 'node:test';
import assert from 'node:assert/strict';
import { auditTradeDiscipline } from './auditor';
import type { TradeDisciplineAuditInput, CognitiveDeviation } from './types';

test('auditTradeDiscipline awards 100 score and MASTER_DISCIPLINE on perfect execution', () => {
  const input: TradeDisciplineAuditInput = {
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    plannedEntry: 5000,
    realizedEntry: 5000,
    plannedStop: 4850,
    realizedExit: 5300,
    targetR1: 5300,
    plannedLots: 100,
    realizedLots: 100,
    trendStillBullish: true,
  };

  const review = auditTradeDiscipline(input);
  assert.equal(review.disciplineScore, 100);
  assert.equal(review.grade, 'MASTER_DISCIPLINE');
  assert.equal(review.isDisciplined, true);
  assert.equal(review.deviations.length, 0);
});

test('auditTradeDiscipline detects FOMO_CHASE when entry slips > 2 ticks higher', () => {
  // Fraksi at 5000 is 25 per tick. Entry 5100 is 4 ticks above 5000.
  const input: TradeDisciplineAuditInput = {
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    plannedEntry: 5000,
    realizedEntry: 5100,
    plannedStop: 4850,
    targetR1: 5300,
    plannedLots: 100,
    realizedLots: 100,
  };

  const review = auditTradeDiscipline(input);
  assert.ok(review.disciplineScore <= 75);
  const fomo = review.deviations.find((d: CognitiveDeviation) => d.type === 'FOMO_CHASE');
  assert.ok(fomo !== undefined);
  assert.equal(fomo.severity, 'MODERATE');
});

test('auditTradeDiscipline detects STOP_WIDENED when exit extends past invalidation', () => {
  // Stop at 4850, but exited at 4750 (4 ticks deeper)
  const input: TradeDisciplineAuditInput = {
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    plannedEntry: 5000,
    realizedEntry: 5000,
    plannedStop: 4850,
    realizedExit: 4750,
    targetR1: 5300,
    plannedLots: 100,
    realizedLots: 100,
  };

  const review = auditTradeDiscipline(input);
  assert.ok(review.disciplineScore <= 65);
  const stopWidened = review.deviations.find((d: CognitiveDeviation) => d.type === 'STOP_WIDENED');
  assert.ok(stopWidened !== undefined);
  assert.equal(stopWidened.severity, 'SEVERE');
});

test('auditTradeDiscipline detects PREMATURE_EXIT when taking profits < 50% to R1 with trend intact', () => {
  // Entry 5000, R1 5300. 50% distance is 5150. Exited at 5050.
  const input: TradeDisciplineAuditInput = {
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    plannedEntry: 5000,
    realizedEntry: 5000,
    plannedStop: 4850,
    realizedExit: 5050,
    targetR1: 5300,
    plannedLots: 100,
    realizedLots: 100,
    trendStillBullish: true,
  };

  const review = auditTradeDiscipline(input);
  const premature = review.deviations.find((d: CognitiveDeviation) => d.type === 'PREMATURE_EXIT');
  assert.ok(premature !== undefined);
});

test('auditTradeDiscipline detects OVERSIZING when lots exceed 1.15x planned', () => {
  const input: TradeDisciplineAuditInput = {
    emiten: 'BBRI',
    tradeDate: '2026-10-02',
    plannedEntry: 5000,
    realizedEntry: 5000,
    plannedStop: 4850,
    targetR1: 5300,
    plannedLots: 100,
    realizedLots: 150, // 50% oversizing
  };

  const review = auditTradeDiscipline(input);
  const oversizing = review.deviations.find((d: CognitiveDeviation) => d.type === 'OVERSIZING');
  assert.ok(oversizing !== undefined);
});

test('auditTradeDiscipline detects REVENGE_TRADE within 30 min of a stop-out', () => {
  const input: TradeDisciplineAuditInput = {
    emiten: 'BMRI',
    tradeDate: '2026-10-02',
    plannedEntry: 6000,
    realizedEntry: 6000,
    plannedStop: 5800,
    targetR1: 6400,
    plannedLots: 100,
    realizedLots: 100,
    minutesSincePreviousStopOut: 12,
  };

  const review = auditTradeDiscipline(input);
  const revenge = review.deviations.find((d: CognitiveDeviation) => d.type === 'REVENGE_TRADE');
  assert.ok(revenge !== undefined);
});
