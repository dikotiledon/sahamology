import { SmcPriceBar, SwingPoint, LiquiditySweepEvent } from './types';

/**
 * Detect Liquidity Sweeps (stop-loss runs / Turtle Soup patterns).
 * A bullish sweep occurs when price wicks below a confirmed swing low
 * but rejects and closes back above that swing low.
 */
export function detectLiquiditySweeps(
  bars: SmcPriceBar[],
  swings: SwingPoint[]
): LiquiditySweepEvent[] {
  if (bars.length === 0 || swings.length === 0) return [];

  const sweeps: LiquiditySweepEvent[] = [];

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const range = bar.high - bar.low;
    if (range <= 0) continue;

    const priorSwings = swings.filter((s) => s.index < i);
    if (priorSwings.length === 0) continue;

    const priorLows = priorSwings.filter((s) => s.type === 'LOW');
    const priorHighs = priorSwings.filter((s) => s.type === 'HIGH');

    // Bullish Liquidity Sweep: Pierces below a prior swing low, but closes back at/above it
    for (const lowPoint of priorLows) {
      if (bar.low < lowPoint.price && bar.close >= lowPoint.price) {
        // Must reject strongly: close in the upper 50% of the bar's range
        const closePosition = (bar.close - bar.low) / range;
        if (closePosition >= 0.45) {
          const depthPct = Number(
            (((lowPoint.price - bar.low) / lowPoint.price) * 100).toFixed(2)
          );
          sweeps.push({
            type: 'BULLISH_SWEEP',
            sweepDate: bar.date,
            originIndex: i,
            sweptPrice: lowPoint.price,
            reclaimedPrice: bar.close,
            sweepDepthPct: depthPct,
            reclaimed: true,
          });
          break; // Avoid duplicate sweeps on the same bar
        }
      }
    }

    // Bearish Liquidity Sweep: Pierces above a prior swing high, but closes back at/below it
    for (const highPoint of priorHighs) {
      if (bar.high > highPoint.price && bar.close <= highPoint.price) {
        const closePosition = (bar.high - bar.close) / range;
        if (closePosition >= 0.45) {
          const depthPct = Number(
            (((bar.high - highPoint.price) / highPoint.price) * 100).toFixed(2)
          );
          sweeps.push({
            type: 'BEARISH_SWEEP',
            sweepDate: bar.date,
            originIndex: i,
            sweptPrice: highPoint.price,
            reclaimedPrice: bar.close,
            sweepDepthPct: depthPct,
            reclaimed: true,
          });
          break;
        }
      }
    }
  }

  return sweeps;
}

/**
 * Returns the most recent liquidity sweep event within the lookback window.
 */
export function getRecentLiquiditySweep(
  sweeps: LiquiditySweepEvent[],
  currentIndex: number,
  maxLookbackBars = 10
): LiquiditySweepEvent | undefined {
  const eligible = sweeps
    .filter((s) => currentIndex - s.originIndex <= maxLookbackBars)
    .sort((a, b) => b.originIndex - a.originIndex);

  return eligible[0];
}
