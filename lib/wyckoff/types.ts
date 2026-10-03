export type WyckoffPhase =
  | 'PHASE_A_STOPPING'
  | 'PHASE_B_ABSORPTION'
  | 'PHASE_C_SPRING'
  | 'PHASE_D_TRANSITION'
  | 'PHASE_E_MARKUP'
  | 'PHASE_DISTRIBUTION'
  | 'WYCKOFF_UNCLASSIFIED';

export type WyckoffEventType =
  | 'SELLING_CLIMAX'
  | 'AUTOMATIC_RALLY'
  | 'SECONDARY_TEST'
  | 'SPRING'
  | 'SIGN_OF_STRENGTH'
  | 'LAST_POINT_OF_SUPPORT'
  | 'UPTHRUST'
  | 'UTAD';

export interface WyckoffBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VsaMetrics {
  spread: number;
  smaSpread20: number;
  relativeSpread: number;
  volume: number;
  smaVolume20: number;
  relativeVolume: number;
  closePosition: number;
  isWideSpread: boolean;
  isNarrowSpread: boolean;
  isHighVolume: boolean;
  isUltraHighVolume: boolean;
  isLowVolume: boolean;
}

export interface TradingRange {
  startDate: string;
  endDate?: string;
  iceSupport: number;
  creekResistance: number;
  midpoint: number;
  rangeWidthPct: number;
  barCount: number;
  status: 'ACTIVE' | 'BROKEN_OUT_UP' | 'BROKEN_OUT_DOWN' | 'INVALIDATED';
}

export interface WyckoffEventOccurrence {
  type: WyckoffEventType;
  date: string;
  price: number;
  relativeVolume: number;
  relativeSpread: number;
  closePosition: number;
  aqsScore?: number;
  notes: string;
}

export interface WyckoffAssessment {
  emiten: string;
  asOfDate: string;
  phase: WyckoffPhase;
  confidenceScore: number;
  markupReadinessScore: number;
  tradingRange: TradingRange | null;
  activeEvents: WyckoffEventOccurrence[];
  springDetected: boolean;
  springLow?: number;
  confluenceTags: string[];
}
