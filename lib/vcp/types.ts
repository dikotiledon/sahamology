/**
 * Types and interfaces for the Volatility Contraction Pattern (VCP)
 * and Minervini Trend Template Engine.
 */

export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type VcpStage =
  | 'DEVELOPING'
  | 'PIVOT_READY'
  | 'BREAKOUT_CONFIRMED'
  | 'FAILED';

export interface ContractionWave {
  waveIndex: number;
  depthPct: number;
  lengthBars: number;
  highPrice: number;
  lowPrice: number;
  avgVolume: number;
}

export interface TrendTemplateResult {
  passed: boolean;
  priceAboveSma50: boolean;
  priceAboveSma150: boolean;
  priceAboveSma200: boolean;
  smaAlignment: boolean; // SMA 50 > SMA 150 > SMA 200
  sma200TrendingUp: boolean; // SMA 200 > SMA 200 20 bars ago
  within25Pct52wHigh: boolean; // within 25% of 52-week high
  atLeast25PctAbove52wLow: boolean; // >= 25% above 52-week low
  currentPrice: number;
  sma50: number;
  sma150: number;
  sma200: number;
  high52w: number;
  low52w: number;
  pctFrom52wHigh: number;
  pctFrom52wLow: number;
}

export interface VcpAssessment {
  emiten: string;
  tradeDate: string;
  stage: VcpStage;
  trendTemplate: TrendTemplateResult;
  contractionCount: number;
  contractions: ContractionWave[];
  pivotPrice: number | null;
  stopLossPrice: number | null;
  riskPct: number | null;
  volumeDryUpRatio: number | null;
  isVolumeDriedUp: boolean;
  confluenceTag?: string;
  summary: string;
}

export interface VcpSnapshotRow {
  id?: number;
  emiten: string;
  trade_date: string;
  trend_template_passed: boolean;
  sma_50: number | null;
  sma_150: number | null;
  sma_200: number | null;
  pct_from_52w_high: number | null;
  pct_from_52w_low: number | null;
  contraction_count: number;
  contractions: ContractionWave[];
  pivot_price: number | null;
  stop_loss_price: number | null;
  volume_dry_up_ratio: number | null;
  vcp_stage: VcpStage;
  confluence_tag: string | null;
  created_at?: string;
}
