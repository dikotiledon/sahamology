import { SmcPriceBar, SwingPoint, BreakOfStructure, MarketStructureType } from './types';

/**
 * Detect confirmed swing points (Swing Highs and Swing Lows)
 * using an isolation radius of k bars (default k=2).
 */
export function detectSwingPoints(bars: SmcPriceBar[], k = 2): SwingPoint[] {
  if (bars.length < 2 * k + 1) return [];

  const swings: SwingPoint[] = [];

  for (let i = k; i < bars.length - k; i++) {
    const current = bars[i];
    let isHigh = true;
    let isLow = true;

    for (let offset = 1; offset <= k; offset++) {
      if (bars[i - offset].high >= current.high || bars[i + offset].high >= current.high) {
        isHigh = false;
      }
      if (bars[i - offset].low <= current.low || bars[i + offset].low <= current.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      swings.push({
        index: i,
        date: current.date,
        type: 'HIGH',
        price: current.high,
      });
    }

    if (isLow) {
      swings.push({
        index: i,
        date: current.date,
        type: 'LOW',
        price: current.low,
      });
    }
  }

  return swings;
}

/**
 * Detect Break of Structure (BOS) and Change of Character (CHoCH) events.
 */
export function detectBreaksOfStructure(
  bars: SmcPriceBar[],
  swings: SwingPoint[]
): { breaks: BreakOfStructure[]; marketStructure: MarketStructureType } {
  if (bars.length === 0 || swings.length === 0) {
    return { breaks: [], marketStructure: 'RANGING' };
  }

  const breaks: BreakOfStructure[] = [];
  let currentTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

  // Compute 20-period volume SMA for volume ratio calculations
  const volSma20: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const start = Math.max(0, i - 19);
    const slice = bars.slice(start, i + 1);
    const avgVol = slice.reduce((sum, b) => sum + b.volume, 0) / slice.length;
    volSma20.push(avgVol > 0 ? avgVol : 1);
  }

  // Iterate chronologically through bars and evaluate against active prior swings
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const priorSwings = swings.filter((s) => s.index < i);
    if (priorSwings.length === 0) continue;

    const priorHighs = priorSwings.filter((s) => s.type === 'HIGH');
    const priorLows = priorSwings.filter((s) => s.type === 'LOW');

    const lastHigh = priorHighs.length > 0 ? priorHighs[priorHighs.length - 1] : null;
    const lastLow = priorLows.length > 0 ? priorLows[priorLows.length - 1] : null;

    // Check bullish break above prior swing high
    if (lastHigh && bar.close > lastHigh.price) {
      // Ensure we haven't already broken this exact swing
      const alreadyBroken = breaks.some(
        (b) => b.direction === 'BULLISH' && b.brokenSwingPrice === lastHigh.price
      );
      if (!alreadyBroken) {
        const isChoch = currentTrend === 'BEARISH';
        breaks.push({
          type: isChoch ? 'CHOCH' : 'BOS',
          direction: 'BULLISH',
          brokenSwingPrice: lastHigh.price,
          breakDate: bar.date,
          breakClosePrice: bar.close,
          volumeRatio: Number((bar.volume / volSma20[i]).toFixed(2)),
        });
        currentTrend = 'BULLISH';
      }
    }

    // Check bearish break below prior swing low
    if (lastLow && bar.close < lastLow.price) {
      const alreadyBroken = breaks.some(
        (b) => b.direction === 'BEARISH' && b.brokenSwingPrice === lastLow.price
      );
      if (!alreadyBroken) {
        const isChoch = currentTrend === 'BULLISH';
        breaks.push({
          type: isChoch ? 'CHOCH' : 'BOS',
          direction: 'BEARISH',
          brokenSwingPrice: lastLow.price,
          breakDate: bar.date,
          breakClosePrice: bar.close,
          volumeRatio: Number((bar.volume / volSma20[i]).toFixed(2)),
        });
        currentTrend = 'BEARISH';
      }
    }
  }

  let marketStructure: MarketStructureType = 'RANGING';
  if (currentTrend === 'BULLISH') {
    marketStructure = 'BULLISH_EXPANSION';
  } else if (currentTrend === 'BEARISH') {
    marketStructure = 'BEARISH_CONTRACTION';
  }

  return { breaks, marketStructure };
}
