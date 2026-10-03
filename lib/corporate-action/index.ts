import {
  ActionType,
  CorporateActionAssessment,
} from './types';
import { calculateDividendMetrics, DividendScorerInput } from './dividend-scorer';
import { calculateRightsIssueMetrics, RightsAnalyzerInput } from './rights-analyzer';
import { evaluateCorpActionConfluence } from './confluence';

export * from './types';
export * from './dividend-scorer';
export * from './rights-analyzer';
export * from './confluence';

export interface EvaluateCorporateActionsInput {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  primaryActionType?: ActionType;
  dividendInput?: Partial<DividendScorerInput>;
  rightsInput?: Partial<RightsAnalyzerInput>;
}

/**
 * Master evaluation function for Corporate Actions, Ex-Date Dividend Arbitrage &
 * Rights Issue Dilution Risk Engine.
 */
export function evaluateCorporateActions(
  input: EvaluateCorporateActionsInput
): CorporateActionAssessment {
  const {
    emiten,
    tradeDate,
    currentPrice,
    primaryActionType = 'NONE',
    dividendInput,
    rightsInput,
  } = input;

  // 1. Calculate Dividend Metrics
  const dividend = calculateDividendMetrics({
    currentPrice,
    tradeDate,
    cumDate: dividendInput?.cumDate ?? null,
    exDate: dividendInput?.exDate ?? null,
    recordingDate: dividendInput?.recordingDate ?? null,
    paymentDate: dividendInput?.paymentDate ?? null,
    dividendAmount: dividendInput?.dividendAmount ?? 0,
    historicalExDropRatio: dividendInput?.historicalExDropRatio ?? 1.05,
    aqsScore: dividendInput?.aqsScore ?? 50,
  });

  // 2. Calculate Rights Issue Metrics (if applicable)
  const rightsIssue = rightsInput?.rightsRatio
    ? calculateRightsIssueMetrics({
        currentPrice,
        cumDate: rightsInput.cumDate ?? null,
        exDate: rightsInput.exDate ?? null,
        rightsRatio: rightsInput.rightsRatio,
        exercisePrice: rightsInput.exercisePrice ?? null,
        standbyBuyer: rightsInput.standbyBuyer ?? null,
      })
    : null;

  // 3. Evaluate Confluence Regime and Score
  const confluence = evaluateCorpActionConfluence({
    currentPrice,
    tradeDate,
    primaryActionType:
      primaryActionType !== 'NONE'
        ? primaryActionType
        : dividend.dividendAmount > 0
        ? 'DIVIDEND'
        : rightsIssue
        ? 'RIGHTS_ISSUE'
        : 'NONE',
    dividend,
    rightsIssue,
  });

  return {
    emiten,
    tradeDate,
    currentPrice,
    primaryActionType:
      primaryActionType !== 'NONE'
        ? primaryActionType
        : dividend.dividendAmount > 0
        ? 'DIVIDEND'
        : rightsIssue
        ? 'RIGHTS_ISSUE'
        : 'NONE',
    dividend,
    rightsIssue,
    confluenceRegime: confluence.regime,
    convictionScore: confluence.score,
    advisory: confluence.advisory,
  };
}
