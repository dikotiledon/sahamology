/**
 * Domain types for Phase 19: Opening Range Breakout (ORB) & Intraday Initial Balance (IB) Engine.
 */

export interface IntradayBar {
  time: string; // e.g. "09:05", "09:15", "10:00"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface InitialBalanceLevels {
  high: number;
  low: number;
  range: number;
  midpoint: number;
  extensionR1: number; // High + 0.5 * Range
  extensionR2: number; // High + 1.0 * Range
  extensionS1: number; // Low - 0.5 * Range
  extensionS2: number; // Low - 1.0 * Range
}

export type DayType =
  | 'TREND_DAY_EXPANSION'
  | 'NORMAL_VARIATION_DAY'
  | 'FAILED_BREAKOUT_TRAP'
  | 'NEUTRAL_ROTATIONAL_DAY';

export type OrbRegime =
  | 'ORB_BULLISH_EXPANSION'
  | 'ORB_PULLBACK_RETEST'
  | 'INSIDE_IB_COILING'
  | 'ORB_FALSE_BREAKOUT_TRAP'
  | 'ORB_BEARISH_BREAKDOWN'
  | 'NEUTRAL_IB';

export interface OrbAssessment {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  ib15: InitialBalanceLevels;
  ib60: InitialBalanceLevels | null;
  dayType: DayType;
  rangeExpansionFactor: number;
  v15mVolume: number;
  confluenceRegime: OrbRegime;
  convictionScore: number;
  advisory: string;
}
