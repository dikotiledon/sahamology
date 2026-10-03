/**
 * Domain types for Phase 20: Corporate Actions, Ex-Date Dividend Arbitrage &
 * Rights Issue Dilution Risk Engine.
 */

export type ActionType =
  | 'DIVIDEND'
  | 'RIGHTS_ISSUE'
  | 'STOCK_SPLIT'
  | 'WARRANT'
  | 'NONE';

export type CorpActionRegime =
  | 'PRE_CUM_RUNUP_EXPANSION'
  | 'POST_EX_ABSORPTION_BOUNCE'
  | 'RIGHTS_ISSUE_STANDBY_SECURED'
  | 'DIVIDEND_TRAP_HAZARD'
  | 'UNSECURED_RIGHTS_DILUTION_RISK'
  | 'NEUTRAL_CORPORATE_ACTION';

export interface DividendMetrics {
  cumDate: string | null;
  exDate: string | null;
  recordingDate: string | null;
  paymentDate: string | null;
  dividendAmount: number;
  dividendYieldPct: number;
  historicalExDropRatio: number; // ExDate Drop / DPS
  dividendTrapScore: number;     // 0 to 100
  daysToCum: number | null;
  isPreCumRunUpEligible: boolean;
}

export interface RightsIssueMetrics {
  cumDate: string | null;
  exDate: string | null;
  rightsRatio: string | null; // e.g. "100:35"
  exercisePrice: number | null;
  theoreticalPrice: number | null;
  dilutionPct: number | null;
  discountPct: number | null;
  standbyBuyer: string | null;
  hasStandbyBuyer: boolean;
}

export interface CorporateActionAssessment {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  primaryActionType: ActionType;
  dividend: DividendMetrics;
  rightsIssue: RightsIssueMetrics | null;
  confluenceRegime: CorpActionRegime;
  convictionScore: number;
  advisory: string;
}
