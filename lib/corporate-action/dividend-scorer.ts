import { DividendMetrics } from './types';

export interface DividendScorerInput {
  currentPrice: number;
  tradeDate: string;
  cumDate?: string | null;
  exDate?: string | null;
  recordingDate?: string | null;
  paymentDate?: string | null;
  dividendAmount: number;
  historicalExDropRatio?: number;
  aqsScore?: number;
}

/**
 * Calculates calendar/trading day offset between two YYYY-MM-DD dates.
 */
export function calculateDaysBetween(fromDateStr: string, toDateStr: string): number {
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  const diffTime = to.getTime() - from.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Analyzes cash dividend metrics, dividend yield, historical drop ratio,
 * and assesses the Dividend Trap Risk Score (0-100).
 */
export function calculateDividendMetrics(input: DividendScorerInput): DividendMetrics {
  const {
    currentPrice,
    tradeDate,
    cumDate = null,
    exDate = null,
    recordingDate = null,
    paymentDate = null,
    dividendAmount,
    historicalExDropRatio = 1.05, // historical IDX average: ExDate drops slightly exceed nominal DPS
    aqsScore = 50,
  } = input;

  if (dividendAmount <= 0 || currentPrice <= 0) {
    return {
      cumDate,
      exDate,
      recordingDate,
      paymentDate,
      dividendAmount: 0,
      dividendYieldPct: 0,
      historicalExDropRatio: 1.0,
      dividendTrapScore: 0,
      daysToCum: null,
      isPreCumRunUpEligible: false,
    };
  }

  const dividendYieldPct = Number(((dividendAmount / currentPrice) * 100).toFixed(2));

  let daysToCum: number | null = null;
  if (cumDate) {
    daysToCum = calculateDaysBetween(tradeDate, cumDate);
  }

  // Calculate Dividend Trap Risk Score (0-100)
  // Higher yield + higher historical ex-date drop ratio + lower AQS increases trap risk
  let rawScore =
    30 +
    dividendYieldPct * 4.5 +
    (historicalExDropRatio - 1.0) * 25 -
    (aqsScore - 50) * 0.35;

  // If Cum Date is today or tomorrow, trap risk accelerates for holding through Ex Date
  if (daysToCum !== null && daysToCum >= 0 && daysToCum <= 1) {
    rawScore += 15;
  }

  const dividendTrapScore = Number(Math.max(0, Math.min(100, rawScore)).toFixed(1));

  // Pre-Cum Run-Up Eligibility: 5 to 20 days prior to Cum Date with yield >= 3.5%
  const isPreCumRunUpEligible =
    daysToCum !== null &&
    daysToCum >= 5 &&
    daysToCum <= 20 &&
    dividendYieldPct >= 3.5 &&
    aqsScore >= 55;

  return {
    cumDate,
    exDate,
    recordingDate,
    paymentDate,
    dividendAmount,
    dividendYieldPct,
    historicalExDropRatio,
    dividendTrapScore,
    daysToCum,
    isPreCumRunUpEligible,
  };
}
