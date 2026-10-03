/**
 * Domain types for Phase 17: Institutional Order Blocks, Fair Value Gaps (FVG)
 * and Liquidity Sweep Engine (Smart Money Concepts / SMC for IDX).
 */

export type MarketStructureType = 'BULLISH_EXPANSION' | 'BEARISH_CONTRACTION' | 'RANGING';

export type MitigationStatus = 'UNMITIGATED' | 'PARTIALLY_MITIGATED' | 'MITIGATED' | 'INVALIDATED';

export interface SmcPriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SwingPoint {
  index: number;
  date: string;
  type: 'HIGH' | 'LOW';
  price: number;
}

export interface BreakOfStructure {
  type: 'BOS' | 'CHOCH';
  direction: 'BULLISH' | 'BEARISH';
  brokenSwingPrice: number;
  breakDate: string;
  breakClosePrice: number;
  volumeRatio: number;
}

export interface OrderBlockZone {
  type: 'BULLISH' | 'BEARISH';
  originDate: string;
  originIndex: number;
  top: number;
  bottom: number;
  midpoint: number;
  mitigationStatus: MitigationStatus;
  mitigationDate?: string;
}

export interface FairValueGapZone {
  type: 'BULLISH' | 'BEARISH';
  candleDate: string;
  originIndex: number;
  top: number;
  bottom: number;
  cePrice: number; // Consequent Encroachment (50% midpoint)
  gapSizePct: number;
  mitigationStatus: MitigationStatus;
  mitigationDate?: string;
}

export interface LiquiditySweepEvent {
  type: 'BULLISH_SWEEP' | 'BEARISH_SWEEP';
  sweepDate: string;
  originIndex: number;
  sweptPrice: number;
  reclaimedPrice: number;
  sweepDepthPct: number;
  reclaimed: boolean;
}

export type SmcRegime =
  | 'PRIME_ORDER_BLOCK_DEFENSE'
  | 'BOS_BULLISH_EXPANSION'
  | 'LIQUIDITY_SWEEP_REVERSAL'
  | 'FVG_REBALANCING_PULLBACK'
  | 'BEARISH_STRUCTURE_CHOCH'
  | 'NEUTRAL_STRUCTURE';

export interface SmartMoneyAssessment {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  marketStructure: MarketStructureType;
  swings: SwingPoint[];
  lastBOS?: BreakOfStructure;
  activeBullishOB?: OrderBlockZone;
  activeBullishFVG?: FairValueGapZone;
  lastLiquiditySweep?: LiquiditySweepEvent;
  confluenceRegime: SmcRegime;
  regimeScore: number;
  advisory: string;
}
