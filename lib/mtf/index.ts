import {
  DailyPriceBar,
  MtfAssessment,
} from './types';
import { aggregateWeeklyBars } from './weekly-aggregator';
import { analyzeWeeklyTrend } from './weekly-analyzer';
import { analyzeDailyTrend } from './daily-analyzer';
import { evaluateAlignmentMatrix } from './alignment-matrix';

export * from './types';
export * from './weekly-aggregator';
export * from './weekly-analyzer';
export * from './daily-analyzer';
export * from './alignment-matrix';

/**
 * Master evaluation function for Multi-Timeframe Alignment & Institutional Trend Matrix.
 * Synthesizes Higher Timeframe (Weekly Tide) and Intermediate Timeframe (Daily Wave).
 */
export function evaluateMultiTimeframeAlignment(
  emiten: string,
  tradeDate: string,
  dailyBars: DailyPriceBar[]
): MtfAssessment {
  if (dailyBars.length === 0) {
    return {
      emiten,
      tradeDate,
      currentPrice: 0,
      weekly: {
        stage: 'STAGE_UNKNOWN',
        weeklyEma10: null,
        weeklyEma30: null,
        slope30wPct: null,
        weeklyBarsCount: 0,
        isExpansion: false,
      },
      daily: {
        trendState: 'NEUTRAL',
        dailyEma20: null,
        dailySma50: null,
        dailySma200: null,
        priceAboveEma20: false,
        priceAboveSma50: false,
        priceAboveSma200: false,
      },
      alignmentRegime: 'MIXED_TRANSITION',
      sizingMultiplier: 0.5,
      alignmentScore: 50,
      advisory: 'Data historis tidak mencukupi untuk evaluasi multi-timeframe.',
    };
  }

  // 1. Sort daily bars chronologically ascending
  const sortedBars = [...dailyBars].sort((a, b) => a.date.localeCompare(b.date));
  const latestDaily = sortedBars[sortedBars.length - 1];
  const currentPrice = latestDaily.close;

  // 2. Synthesize Weekly Bars and analyze Weekly Tide
  const weeklyBars = aggregateWeeklyBars(sortedBars);
  const weekly = analyzeWeeklyTrend(weeklyBars);

  // 3. Analyze Intermediate Daily Wave
  const daily = analyzeDailyTrend(sortedBars);

  // 4. Synthesize Alignment Matrix
  const alignment = evaluateAlignmentMatrix(weekly, daily);

  return {
    emiten,
    tradeDate,
    currentPrice,
    weekly,
    daily,
    alignmentRegime: alignment.regime,
    sizingMultiplier: alignment.sizingMultiplier,
    alignmentScore: alignment.score,
    advisory: alignment.advisory,
  };
}
