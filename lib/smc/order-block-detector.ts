import { SmcPriceBar, OrderBlockZone, BreakOfStructure } from './types';

/**
 * Detect Bullish and Bearish Order Blocks based on confirmed Break of Structure impulses.
 */
export function detectOrderBlocks(
  bars: SmcPriceBar[],
  breaks: BreakOfStructure[]
): OrderBlockZone[] {
  if (bars.length < 3 || breaks.length === 0) return [];

  const orderBlocks: OrderBlockZone[] = [];

  for (const bos of breaks) {
    const breakIndex = bars.findIndex((b) => b.date === bos.breakDate);
    if (breakIndex < 1) continue;

    if (bos.direction === 'BULLISH') {
      // Find the last down-close candle (Close < Open) preceding the break impulse
      let obIndex = -1;
      for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 8); i--) {
        if (bars[i].close < bars[i].open) {
          obIndex = i;
          break;
        }
      }

      // If no strict down candle is found, fallback to the lowest bar in the pre-impulse run
      if (obIndex === -1) {
        let lowestLow = Infinity;
        for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 5); i--) {
          if (bars[i].low < lowestLow) {
            lowestLow = bars[i].low;
            obIndex = i;
          }
        }
      }

      if (obIndex !== -1) {
        const obBar = bars[obIndex];
        const top = obBar.high;
        const bottom = obBar.low;
        const midpoint = Number(((top + bottom) / 2).toFixed(2));

        // Evaluate mitigation across subsequent bars
        let status: OrderBlockZone['mitigationStatus'] = 'UNMITIGATED';
        let mitigationDate: string | undefined;

        for (let j = obIndex + 1; j < bars.length; j++) {
          const subsequent = bars[j];

          // If price closes below the bottom, the OB is invalidated
          if (subsequent.close < bottom) {
            status = 'INVALIDATED';
            mitigationDate = subsequent.date;
            break;
          }

          // If price touches or dips into the zone [bottom, top]
          if (subsequent.low <= top) {
            if (subsequent.low <= midpoint) {
              status = 'MITIGATED';
            } else {
              status = 'PARTIALLY_MITIGATED';
            }
            if (!mitigationDate) {
              mitigationDate = subsequent.date;
            }
          }
        }

        orderBlocks.push({
          type: 'BULLISH',
          originDate: obBar.date,
          originIndex: obIndex,
          top,
          bottom,
          midpoint,
          mitigationStatus: status,
          mitigationDate,
        });
      }
    } else if (bos.direction === 'BEARISH') {
      // Find the last up-close candle (Close > Open) preceding the break impulse
      let obIndex = -1;
      for (let i = breakIndex - 1; i >= Math.max(0, breakIndex - 8); i--) {
        if (bars[i].close > bars[i].open) {
          obIndex = i;
          break;
        }
      }

      if (obIndex !== -1) {
        const obBar = bars[obIndex];
        const top = obBar.high;
        const bottom = obBar.low;
        const midpoint = Number(((top + bottom) / 2).toFixed(2));

        let status: OrderBlockZone['mitigationStatus'] = 'UNMITIGATED';
        let mitigationDate: string | undefined;

        for (let j = obIndex + 1; j < bars.length; j++) {
          const subsequent = bars[j];
          if (subsequent.close > top) {
            status = 'INVALIDATED';
            mitigationDate = subsequent.date;
            break;
          }
          if (subsequent.high >= bottom) {
            if (subsequent.high >= midpoint) {
              status = 'MITIGATED';
            } else {
              status = 'PARTIALLY_MITIGATED';
            }
            if (!mitigationDate) {
              mitigationDate = subsequent.date;
            }
          }
        }

        orderBlocks.push({
          type: 'BEARISH',
          originDate: obBar.date,
          originIndex: obIndex,
          top,
          bottom,
          midpoint,
          mitigationStatus: status,
          mitigationDate,
        });
      }
    }
  }

  return orderBlocks;
}

/**
 * Returns the most relevant active Bullish Order Block (unmitigated or partially mitigated).
 */
export function getActiveBullishOrderBlock(
  orderBlocks: OrderBlockZone[],
  currentPrice: number
): OrderBlockZone | undefined {
  const candidates = orderBlocks
    .filter(
      (ob) =>
        ob.type === 'BULLISH' &&
        (ob.mitigationStatus === 'UNMITIGATED' || ob.mitigationStatus === 'PARTIALLY_MITIGATED') &&
        currentPrice >= ob.bottom * 0.98
    )
    .sort((a, b) => b.originIndex - a.originIndex);

  return candidates[0];
}
