import { detectContractions } from './contraction-detector';
import { evaluateTrendTemplate } from './trend-template';
import { evaluateVcpConfluence } from './confluence';
import type { PriceBar, VcpAssessment } from './types';

export * from './types';
export * from './trend-template';
export * from './contraction-detector';
export * from './confluence';

export interface EvaluateVcpOptions {
  aqsScore?: number;
  wyckoffPhase?: string;
  pocPrice?: number;
  sectorQuadrant?: string;
  lookbackBars?: number;
}

/**
 * Master evaluation function for Volatility Contraction Pattern (VCP)
 * and Minervini Stage 2 Trend Template.
 */
export function evaluateVcp(
  emiten: string,
  bars: PriceBar[],
  options?: EvaluateVcpOptions,
): VcpAssessment {
  const tradeDate = bars && bars.length > 0 ? bars[bars.length - 1].date : new Date().toISOString().slice(0, 10);

  const trend = evaluateTrendTemplate(bars);
  const vcp = detectContractions(bars, options?.lookbackBars ?? 60);

  const confluence = evaluateVcpConfluence({
    vcp,
    trend,
    aqsScore: options?.aqsScore,
    wyckoffPhase: options?.wyckoffPhase,
    pocPrice: options?.pocPrice,
    sectorQuadrant: options?.sectorQuadrant,
  });

  return {
    emiten,
    tradeDate,
    stage: vcp.stage,
    trendTemplate: trend,
    contractionCount: vcp.contractionCount,
    contractions: vcp.contractions,
    pivotPrice: vcp.pivotPrice,
    stopLossPrice: vcp.stopLossPrice,
    riskPct: vcp.riskPct,
    volumeDryUpRatio: vcp.volumeDryUpRatio,
    isVolumeDriedUp: vcp.isVolumeDriedUp,
    confluenceTag: confluence.confluenceTag,
    summary: `${vcp.summary} ${confluence.advisory}`,
  };
}
