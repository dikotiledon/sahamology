export type CognitiveDeviationType =
  | 'FOMO_CHASE'
  | 'STOP_WIDENED'
  | 'PREMATURE_EXIT'
  | 'OVERSIZING'
  | 'REVENGE_TRADE';

export type CognitiveSeverity = 'MILD' | 'MODERATE' | 'SEVERE';

export interface CognitiveDeviation {
  type: CognitiveDeviationType;
  penalty: number;
  severity: CognitiveSeverity;
  description: string;
}

export type DisciplineGrade =
  | 'MASTER_DISCIPLINE'
  | 'ACCEPTABLE_EXECUTION'
  | 'SLIPPY_DISCIPLINE'
  | 'UNGOVERNED_EXECUTION';

export type PsychologicalState = 'CALM' | 'EUPHORIC' | 'ANXIOUS' | 'FRUSTRATED';

export interface TradeDisciplineAuditInput {
  emiten: string;
  tradeDate: string;
  plannedEntry: number;
  realizedEntry: number;
  plannedStop: number;
  realizedExit?: number | null;
  targetR1: number;
  plannedLots: number;
  realizedLots: number;
  trendStillBullish?: boolean;
  minutesSincePreviousStopOut?: number;
  psychologicalStateAtEntry?: PsychologicalState;
  traderReflection?: string;
}

export interface TradeDisciplineReview {
  emiten: string;
  tradeDate: string;
  disciplineScore: number;
  grade: DisciplineGrade;
  deviations: CognitiveDeviation[];
  isDisciplined: boolean;
  summary: string;
  psychologicalState: PsychologicalState;
  traderReflection?: string;
}
