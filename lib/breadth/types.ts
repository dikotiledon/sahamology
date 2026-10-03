/**
 * Types and interfaces for the IDX Market Breadth & Composite Liquidity Engine (IHSG Pulse).
 */

export type MarketRegime =
  | 'BULLISH_EXPANSION'
  | 'HEALTHY_PULLBACK'
  | 'BREADTH_DIVERGENCE_WARNING'
  | 'BEARISH_DISTRIBUTION'
  | 'OVERSOLD_CAPITULATION';

export interface BreadthConstituent {
  emiten: string;
  close: number;
  prevClose: number;
  ema20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  high52w?: number | null;
  low52w?: number | null;
  foreignNetValue?: number | null;
}

export interface MarketBreadthMetric {
  tradeDate: string;
  advancers: number;
  decliners: number;
  unchanged: number;
  adRatio: number;
  pctAboveEma20: number;
  pctAboveSma50: number;
  pctAboveSma200: number;
  newHighs52w: number;
  newLows52w: number;
  netNewHighs: number;
  netForeignFlow: number;
  constituentCount: number;
  marketRegime: MarketRegime;
  regimeScore: number;
  advisory: string;
}

export interface MarketBreadthRow {
  id?: number;
  trade_date: string;
  advancers: number;
  decliners: number;
  unchanged: number;
  ad_ratio: number;
  pct_above_ema20: number;
  pct_above_sma50: number;
  pct_above_sma200: number;
  new_highs_52w: number;
  new_lows_52w: number;
  net_foreign_flow: number;
  market_regime: MarketRegime;
  regime_score: number;
  constituent_count: number;
  advisory: string | null;
  created_at?: string;
}
