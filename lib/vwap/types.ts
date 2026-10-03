/**
 * Types and interfaces for the Anchored VWAP (AVWAP) & Institutional Broker Benchmark Engine.
 */

export type VwapConfluenceRegime =
  | 'AT_INSTITUTIONAL_DEFENSE'
  | 'ABOVE_ALL_ANCHORS_EXPANSION'
  | 'OVEREXTENDED_VALUE_EXHAUSTION'
  | 'TRAPPED_BELOW_CLIMAX'
  | 'INSTITUTIONAL_CAPITULATION_BREAKDOWN';

export interface VwapPriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  value?: number;
}

export interface VwapAnchorMetric {
  anchorName: string;
  anchorDate: string;
  anchorIndex: number;
  vwap: number;
  upperBand1sd: number;
  lowerBand1sd: number;
  upperBand2sd: number;
  lowerBand2sd: number;
  stdDev: number;
  sampleBars: number;
}

export interface BrokerSummaryItem {
  brokerCode: string;
  netBuyValue: number;
  netBuyLot: number;
}

export interface AnchoredVwapResult {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  baseAnchor: VwapAnchorMetric;
  volumeClimaxAnchor: VwapAnchorMetric | null;
  high52wAnchor: VwapAnchorMetric | null;
  bandarVwapTop3: number | null;
  bandarVwapTop5: number | null;
  confluenceRegime: VwapConfluenceRegime;
  regimeScore: number;
  advisory: string;
  spreadToBasePct: number;
  spreadToBandarPct: number | null;
}

export interface AnchoredVwapRow {
  id?: number;
  emiten: string;
  trade_date: string;
  base_avwap: number;
  base_upper_band_1sd: number | null;
  base_lower_band_1sd: number | null;
  base_upper_band_2sd: number | null;
  base_lower_band_2sd: number | null;
  volume_climax_avwap: number | null;
  high_52w_avwap: number | null;
  bandar_vwap_top3: number | null;
  bandar_vwap_top5: number | null;
  confluence_regime: VwapConfluenceRegime;
  regime_score: number;
  advisory: string | null;
  anchor_metadata: Record<string, unknown>;
  created_at?: string;
}
