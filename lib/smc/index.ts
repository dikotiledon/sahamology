import {
  SmcPriceBar,
  SmartMoneyAssessment,
  BreakOfStructure,
  OrderBlockZone,
  FairValueGapZone,
  LiquiditySweepEvent,
} from './types';
import { detectSwingPoints, detectBreaksOfStructure } from './swing-detector';
import { detectOrderBlocks, getActiveBullishOrderBlock } from './order-block-detector';
import { detectFairValueGaps, getActiveBullishFVG } from './fvg-detector';
import { detectLiquiditySweeps, getRecentLiquiditySweep } from './sweep-detector';
import { evaluateSmcConfluence } from './confluence';

export * from './types';
export * from './swing-detector';
export * from './order-block-detector';
export * from './fvg-detector';
export * from './sweep-detector';
export * from './confluence';

/**
 * Master evaluation function for Smart Money Concepts (SMC) on IDX daily bars.
 */
export function evaluateSmartMoneyStructure(
  emiten: string,
  tradeDate: string,
  bars: SmcPriceBar[]
): SmartMoneyAssessment {
  if (bars.length < 5) {
    return {
      emiten,
      tradeDate,
      currentPrice: bars.length > 0 ? bars[bars.length - 1].close : 0,
      marketStructure: 'RANGING',
      swings: [],
      confluenceRegime: 'NEUTRAL_STRUCTURE',
      regimeScore: 50,
      advisory: 'Data historis tidak mencukupi untuk evaluasi Smart Money Concepts (butuh >= 5 bar).',
    };
  }

  const latestBar = bars[bars.length - 1];
  const currentPrice = latestBar.close;
  const currentIndex = bars.length - 1;

  // 1. Detect Swing Highs and Lows
  const swings = detectSwingPoints(bars, 2);

  // 2. Detect Breaks of Structure and Market Structure
  const { breaks, marketStructure } = detectBreaksOfStructure(bars, swings);
  const lastBOS: BreakOfStructure | undefined = breaks[breaks.length - 1];

  let daysSinceBOS = 999;
  if (lastBOS) {
    const breakIndex = bars.findIndex((b) => b.date === lastBOS.breakDate);
    if (breakIndex !== -1) {
      daysSinceBOS = currentIndex - breakIndex;
    }
  }

  // 3. Detect Order Blocks
  const allOrderBlocks: OrderBlockZone[] = detectOrderBlocks(bars, breaks);
  const activeBullishOB = getActiveBullishOrderBlock(allOrderBlocks, currentPrice);

  // 4. Detect Fair Value Gaps (FVG)
  const allFVGs: FairValueGapZone[] = detectFairValueGaps(bars);
  const activeBullishFVG = getActiveBullishFVG(allFVGs, currentPrice);

  // 5. Detect Liquidity Sweeps
  const allSweeps: LiquiditySweepEvent[] = detectLiquiditySweeps(bars, swings);
  const lastLiquiditySweep = getRecentLiquiditySweep(allSweeps, currentIndex, 10);

  let daysSinceSweep = 999;
  if (lastLiquiditySweep) {
    daysSinceSweep = currentIndex - lastLiquiditySweep.originIndex;
  }

  // 6. Evaluate Confluence Regime and Score
  const confluence = evaluateSmcConfluence({
    currentPrice,
    marketStructure,
    lastBOS,
    activeBullishOB,
    activeBullishFVG,
    lastLiquiditySweep,
    daysSinceBOS,
    daysSinceSweep,
  });

  return {
    emiten,
    tradeDate,
    currentPrice,
    marketStructure,
    swings,
    lastBOS,
    activeBullishOB,
    activeBullishFVG,
    lastLiquiditySweep,
    confluenceRegime: confluence.regime,
    regimeScore: confluence.score,
    advisory: confluence.advisory,
  };
}
