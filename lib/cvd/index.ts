import {
  PriceVolumeBar,
  ForeignTradeStats,
  CvdAssessment,
} from './types';
import {
  calculateBarDeltas,
  calculateCvdMetrics,
} from './delta-calculator';
import { calculateTapeAggression } from './tape-aggression';
import { detectCvdDivergence } from './divergence-detector';
import { evaluateCvdConfluence } from './confluence';

export * from './types';
export * from './delta-calculator';
export * from './tape-aggression';
export * from './divergence-detector';
export * from './confluence';

export interface EvaluateCvdInput {
  emiten: string;
  tradeDate: string;
  bars: PriceVolumeBar[];
  foreignStats?: ForeignTradeStats;
}

/**
 * Master evaluation function for Cumulative Volume Delta (CVD) Proxy,
 * Foreign Tape Aggression & Passive Absorption Divergence Engine.
 */
export function evaluateCumulativeVolumeDelta(
  input: EvaluateCvdInput
): CvdAssessment {
  const { emiten, tradeDate, bars, foreignStats } = input;

  if (bars.length === 0) {
    return {
      emiten,
      tradeDate,
      currentPrice: 0,
      cvd: {
        cvd20d: 0,
        cvd50d: 0,
        deltaRatioPct: 0,
        currentBarDelta: 0,
        trend: 'NEUTRAL',
      },
      aggression: {
        foreignBuyValue: 0,
        foreignSellValue: 0,
        aggressionRatio: 0.5,
        status: 'BALANCED',
      },
      divergence: 'NONE',
      confluenceRegime: 'NEUTRAL_DELTA_ROTATION',
      convictionScore: 50,
      advisory: 'Data historis volume dan harga belum mencukupi untuk evaluasi Cumulative Volume Delta.',
    };
  }

  const currentPrice = bars[bars.length - 1].close;

  // 1. Calculate Single-Bar Volume Deltas across historical bars
  const barDeltas = calculateBarDeltas(bars);

  // 2. Compute 20d & 50d Rolling Cumulative Volume Delta (CVD)
  const cvdMetrics = calculateCvdMetrics(barDeltas);

  // 3. Compute Foreign Tape Aggression Ratio
  const aggression = calculateTapeAggression(
    foreignStats?.foreignBuyValue || 0,
    foreignStats?.foreignSellValue || 0
  );

  // 4. Detect Order Flow Divergences (Absorption vs Exhaustion)
  const divergenceResult = detectCvdDivergence(barDeltas, 20);

  // 5. Evaluate Tactical Confluence Regime
  const confluence = evaluateCvdConfluence({
    currentPrice,
    cvd: cvdMetrics,
    aggression,
    divergence: divergenceResult.type,
  });

  return {
    emiten,
    tradeDate,
    currentPrice,
    cvd: cvdMetrics,
    aggression,
    divergence: divergenceResult.type,
    confluenceRegime: confluence.regime,
    convictionScore: confluence.score,
    advisory: confluence.advisory,
  };
}
