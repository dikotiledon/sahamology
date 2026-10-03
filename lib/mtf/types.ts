/**
 * Domain types for Phase 18: Multi-Timeframe Alignment & Institutional Trend Matrix
 * (Triple Screen & Weinstein Stages for IDX).
 */

export interface DailyPriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WeeklyBar {
  weekKey: string; // e.g. "2026-W38"
  startDate: string;
  endDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type WeinsteinStage =
  | 'STAGE_1_BASING'
  | 'STAGE_2_EXPANSION'
  | 'STAGE_3_DISTRIBUTION'
  | 'STAGE_4_CAPITULATION'
  | 'STAGE_UNKNOWN';

export interface WeeklyMetrics {
  stage: WeinsteinStage;
  weeklyEma10: number | null;
  weeklyEma30: number | null;
  slope30wPct: number | null;
  weeklyBarsCount: number;
  isExpansion: boolean;
}

export type DailyTrendState =
  | 'BULLISH_EXPANSION'
  | 'PULLBACK_SUPPORT'
  | 'BEARISH_CONTRACTION'
  | 'NEUTRAL';

export interface DailyMetrics {
  trendState: DailyTrendState;
  dailyEma20: number | null;
  dailySma50: number | null;
  dailySma200: number | null;
  priceAboveEma20: boolean;
  priceAboveSma50: boolean;
  priceAboveSma200: boolean;
}

export type MtfRegime =
  | 'PERFECT_TIDE_ALIGNMENT'
  | 'HIGH_PROBABILITY_PULLBACK'
  | 'RANGE_BOUND_COMPRESSION'
  | 'COUNTER_TREND_TRAP_HAZARD'
  | 'SECULAR_LIQUIDATION'
  | 'MIXED_TRANSITION';

export interface MtfAssessment {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  weekly: WeeklyMetrics;
  daily: DailyMetrics;
  alignmentRegime: MtfRegime;
  sizingMultiplier: number;
  alignmentScore: number;
  advisory: string;
}
