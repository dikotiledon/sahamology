import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDaysBetween,
  calculateDividendMetrics,
  parseRightsRatio,
  calculateRightsIssueMetrics,
  evaluateCorpActionConfluence,
  evaluateCorporateActions,
} from './index';

test('calculateDaysBetween accurately measures calendar day differences', () => {
  assert.equal(calculateDaysBetween('2026-10-01', '2026-10-15'), 14);
  assert.equal(calculateDaysBetween('2026-10-15', '2026-10-10'), -5);
  assert.equal(calculateDaysBetween('2026-10-05', '2026-10-05'), 0);
});

test('calculateDividendMetrics computes yield, trap risk score, and run-up eligibility', () => {
  // PTBA scenario: Price 2800, DPS 350 -> Yield 12.5%, Cum Date in 10 days
  const ptba = calculateDividendMetrics({
    currentPrice: 2800,
    tradeDate: '2026-10-01',
    cumDate: '2026-10-11',
    dividendAmount: 350,
    historicalExDropRatio: 1.15,
    aqsScore: 65,
  });

  assert.equal(ptba.dividendYieldPct, 12.5);
  assert.equal(ptba.daysToCum, 10);
  assert.equal(ptba.isPreCumRunUpEligible, true);
  assert.ok(ptba.dividendTrapScore > 50, `Expected trap score > 50, got ${ptba.dividendTrapScore}`);

  // Safe low yield scenario: Price 10000, DPS 100 -> Yield 1.0%
  const bbca = calculateDividendMetrics({
    currentPrice: 10000,
    tradeDate: '2026-10-01',
    cumDate: '2026-10-25',
    dividendAmount: 100,
    historicalExDropRatio: 0.85,
    aqsScore: 75,
  });

  assert.equal(bbca.dividendYieldPct, 1.0);
  assert.ok(bbca.dividendTrapScore < 45);

  // Zero dividend edge case
  const zero = calculateDividendMetrics({
    currentPrice: 5000,
    tradeDate: '2026-10-01',
    dividendAmount: 0,
  });
  assert.equal(zero.dividendYieldPct, 0);
  assert.equal(zero.dividendTrapScore, 0);
  assert.equal(zero.isPreCumRunUpEligible, false);
});

test('calculateRightsIssueMetrics computes theoretical price, dilution, and discount', () => {
  // 100 old shares get 25 new shares at Rp 1000, market price Rp 2000
  const rights = calculateRightsIssueMetrics({
    currentPrice: 2000,
    rightsRatio: '100:25',
    exercisePrice: 1000,
    standbyBuyer: 'PT Danareksa Capital',
  });

  assert.ok(rights !== null);
  // Theoretical = (100 * 2000 + 25 * 1000) / 125 = (200000 + 25000) / 125 = 225000 / 125 = 1800
  assert.equal(rights.theoreticalPrice, 1800);
  // Dilution % = 25 / 125 * 100 = 20%
  assert.equal(rights.dilutionPct, 20);
  // Discount % = (2000 - 1000) / 2000 * 100 = 50%
  assert.equal(rights.discountPct, 50);
  assert.equal(rights.hasStandbyBuyer, true);
  assert.equal(rights.standbyBuyer, 'PT Danareksa Capital');

  // Invalid ratio handling
  const invalid = calculateRightsIssueMetrics({
    currentPrice: 2000,
    rightsRatio: 'invalid',
    exercisePrice: 1000,
  });
  assert.equal(invalid, null);
});

test('parseRightsRatio parses valid colon-separated ratios', () => {
  assert.deepEqual(parseRightsRatio('100:35'), [100, 35]);
  assert.deepEqual(parseRightsRatio('10:1'), [10, 1]);
  assert.equal(parseRightsRatio(''), null);
  assert.equal(parseRightsRatio(null), null);
});

test('evaluateCorpActionConfluence assigns expected regimes and scores', () => {
  // Test 1: PRE_CUM_RUNUP_EXPANSION
  const runup = evaluateCorpActionConfluence({
    currentPrice: 3000,
    tradeDate: '2026-10-01',
    primaryActionType: 'DIVIDEND',
    dividend: {
      cumDate: '2026-10-12',
      exDate: '2026-10-13',
      recordingDate: '2026-10-14',
      paymentDate: '2026-10-25',
      dividendAmount: 180,
      dividendYieldPct: 6.0,
      historicalExDropRatio: 1.05,
      dividendTrapScore: 55,
      daysToCum: 11,
      isPreCumRunUpEligible: true,
    },
  });
  assert.equal(runup.regime, 'PRE_CUM_RUNUP_EXPANSION');
  assert.equal(runup.score, 90);

  // Test 2: DIVIDEND_TRAP_HAZARD (Cum Date tomorrow with high yield)
  const trap = evaluateCorpActionConfluence({
    currentPrice: 2500,
    tradeDate: '2026-10-01',
    primaryActionType: 'DIVIDEND',
    dividend: {
      cumDate: '2026-10-02',
      exDate: '2026-10-03',
      recordingDate: '2026-10-04',
      paymentDate: '2026-10-15',
      dividendAmount: 250,
      dividendYieldPct: 10.0,
      historicalExDropRatio: 1.25,
      dividendTrapScore: 82,
      daysToCum: 1,
      isPreCumRunUpEligible: false,
    },
  });
  assert.equal(trap.regime, 'DIVIDEND_TRAP_HAZARD');
  assert.equal(trap.score, 30);

  // Test 3: UNSECURED_RIGHTS_DILUTION_RISK
  const unsecuredRights = evaluateCorpActionConfluence({
    currentPrice: 1000,
    tradeDate: '2026-10-01',
    primaryActionType: 'RIGHTS_ISSUE',
    dividend: {
      cumDate: null,
      exDate: null,
      recordingDate: null,
      paymentDate: null,
      dividendAmount: 0,
      dividendYieldPct: 0,
      historicalExDropRatio: 1.0,
      dividendTrapScore: 0,
      daysToCum: null,
      isPreCumRunUpEligible: false,
    },
    rightsIssue: {
      cumDate: '2026-10-10',
      exDate: '2026-10-11',
      rightsRatio: '100:80',
      exercisePrice: 500,
      theoreticalPrice: 777.78,
      dilutionPct: 44.44, // > 35%
      discountPct: 50.0,
      standbyBuyer: null,
      hasStandbyBuyer: false,
    },
  });
  assert.equal(unsecuredRights.regime, 'UNSECURED_RIGHTS_DILUTION_RISK');
  assert.equal(unsecuredRights.score, 20);

  // Test 4: NEUTRAL_CORPORATE_ACTION
  const neutral = evaluateCorpActionConfluence({
    currentPrice: 5000,
    tradeDate: '2026-10-01',
    primaryActionType: 'NONE',
    dividend: {
      cumDate: null,
      exDate: null,
      recordingDate: null,
      paymentDate: null,
      dividendAmount: 0,
      dividendYieldPct: 0,
      historicalExDropRatio: 1.0,
      dividendTrapScore: 0,
      daysToCum: null,
      isPreCumRunUpEligible: false,
    },
  });
  assert.equal(neutral.regime, 'NEUTRAL_CORPORATE_ACTION');
  assert.equal(neutral.score, 50);
});

test('evaluateCorporateActions master pipeline handles full evaluation and defaults', () => {
  const assessment = evaluateCorporateActions({
    emiten: 'PTBA',
    tradeDate: '2026-10-01',
    currentPrice: 2800,
    primaryActionType: 'DIVIDEND',
    dividendInput: {
      cumDate: '2026-10-15',
      exDate: '2026-10-16',
      dividendAmount: 320,
      historicalExDropRatio: 1.1,
      aqsScore: 70,
    },
  });

  assert.equal(assessment.emiten, 'PTBA');
  assert.equal(assessment.currentPrice, 2800);
  assert.equal(assessment.primaryActionType, 'DIVIDEND');
  assert.equal(assessment.dividend.dividendAmount, 320);
  assert.ok(assessment.dividend.dividendYieldPct > 10);
  assert.equal(assessment.confluenceRegime, 'PRE_CUM_RUNUP_EXPANSION');
  assert.equal(assessment.convictionScore, 90);
  assert.ok(assessment.advisory.length > 0);
});
