/**
 * Domain types for Phase 21: Cumulative Volume Delta (CVD) Proxy,
 * Foreign Tape Aggression & Passive Absorption Divergence Engine.
 */

export interface PriceVolumeBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ForeignTradeStats {
  date: string;
  foreignBuyValue: number;
  foreignSellValue: number;
}

export interface BarDelta {
  date: string;
  deltaVolume: number;
  clv: number;
  close: number;
  volume: number;
}

export interface CvdMetrics {
  cvd20d: number;
  cvd50d: number;
  deltaRatioPct: number;
  currentBarDelta: number;
  trend: 'ACCUMULATING' | 'DISTRIBUTING' | 'NEUTRAL';
}

export interface TapeAggression {
  foreignBuyValue: number;
  foreignSellValue: number;
  aggressionRatio: number; // Foreign Buy / (Foreign Buy + Foreign Sell)
  status: 'DOMINANT_BUY_AGGRESSION' | 'DOMINANT_SELL_AGGRESSION' | 'BALANCED';
}

export type CvdDivergenceType =
  | 'BULLISH_CVD_ABSORPTION'
  | 'BEARISH_CVD_EXHAUSTION'
  | 'NONE';

export type CvdRegime =
  | 'BULLISH_CVD_ABSORPTION'
  | 'AGGRESSIVE_MARKET_MARKUP'
  | 'NEUTRAL_DELTA_ROTATION'
  | 'BEARISH_CVD_EXHAUSTION'
  | 'AGGRESSIVE_MARKET_MARKDOWN';

export interface CvdAssessment {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  cvd: CvdMetrics;
  aggression: TapeAggression;
  divergence: CvdDivergenceType;
  confluenceRegime: CvdRegime;
  convictionScore: number;
  advisory: string;
}
