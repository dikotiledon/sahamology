import {
  BrokerSummaryRecord,
  RhiAssessment,
} from './types';
import { calculateRetailHerdMetrics } from './rhi-calculator';
import { evaluateRhiConfluence } from './confluence';

export * from './types';
export * from './broker-classifier';
export * from './rhi-calculator';
export * from './confluence';

export interface EvaluateRhiInput {
  emiten: string;
  tradeDate: string;
  currentPrice: number;
  records: BrokerSummaryRecord[];
}

/**
 * Master evaluation function for Retail Herd Dispersion, Broker Concentration &
 * Syndicate Asymmetry Engine (Retail Herd Index / RHI for IDX).
 */
export function evaluateRetailHerdIndex(input: EvaluateRhiInput): RhiAssessment {
  const { emiten, tradeDate, currentPrice, records } = input;

  if (records.length === 0) {
    return {
      emiten,
      tradeDate,
      currentPrice,
      rhiScore: 50,
      retail: {
        retailGrossValue: 0,
        retailNetBuyValue: 0,
        retailParticipationRatio: 0,
        topRetailBuyer: null,
        topRetailSeller: null,
      },
      syndicate: {
        top1NetBuyValue: 0,
        top3NetBuyValue: 0,
        top5NetBuyValue: 0,
        top3ConcentrationRatio: 0,
        topSyndicateBuyer: null,
        topSyndicateSeller: null,
        syndicateAsymmetryRatio: 1.0,
      },
      confluenceRegime: 'BALANCED_HERD_FLOW',
      convictionScore: 50,
      advisory: 'Data broker summary harian belum tersedia untuk kalkulasi Retail Herd Index.',
    };
  }

  // 1. Calculate Retail Herd Metrics & Syndicate Asymmetry
  const metrics = calculateRetailHerdMetrics(records);

  // 2. Evaluate Tactical Confluence Regime
  const confluence = evaluateRhiConfluence({
    currentPrice,
    rhiScore: metrics.rhiScore,
    retail: metrics.retail,
    syndicate: metrics.syndicate,
    totalTurnover: metrics.totalTurnover,
  });

  return {
    emiten,
    tradeDate,
    currentPrice,
    rhiScore: metrics.rhiScore,
    retail: metrics.retail,
    syndicate: metrics.syndicate,
    confluenceRegime: confluence.regime,
    convictionScore: confluence.score,
    advisory: confluence.advisory,
  };
}
