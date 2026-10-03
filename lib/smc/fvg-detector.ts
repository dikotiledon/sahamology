import { SmcPriceBar, FairValueGapZone } from './types';

/**
 * Detect Fair Value Gaps (FVG) / Imbalances in 3-bar sequences.
 * Bullish FVG: Low(i) > High(i-2)
 * Bearish FVG: High(i) < Low(i-2)
 */
export function detectFairValueGaps(
  bars: SmcPriceBar[],
  minGapPct = 0.5
): FairValueGapZone[] {
  if (bars.length < 3) return [];

  const fvgs: FairValueGapZone[] = [];

  for (let i = 2; i < bars.length; i++) {
    const candle1 = bars[i - 2];
    const candle2 = bars[i - 1];
    const candle3 = bars[i];

    // Bullish FVG (BISI: Buy-Side Imbalance Sell-Side Inefficiency)
    if (candle3.low > candle1.high && candle2.close > candle2.open) {
      const bottom = candle1.high;
      const top = candle3.low;
      const gapSizePct = Number((((top - bottom) / bottom) * 100).toFixed(2));

      if (gapSizePct >= minGapPct) {
        const cePrice = Number(((top + bottom) / 2).toFixed(2));
        let status: FairValueGapZone['mitigationStatus'] = 'UNMITIGATED';
        let mitigationDate: string | undefined;

        for (let j = i + 1; j < bars.length; j++) {
          const subsequent = bars[j];

          if (subsequent.close < bottom) {
            status = 'INVALIDATED';
            mitigationDate = subsequent.date;
            break;
          }

          if (subsequent.low <= top) {
            if (subsequent.low <= bottom) {
              status = 'MITIGATED';
            } else if (subsequent.low <= cePrice) {
              status = 'PARTIALLY_MITIGATED';
            } else {
              status = 'PARTIALLY_MITIGATED';
            }
            if (!mitigationDate) {
              mitigationDate = subsequent.date;
            }
          }
        }

        fvgs.push({
          type: 'BULLISH',
          candleDate: candle3.date,
          originIndex: i,
          top,
          bottom,
          cePrice,
          gapSizePct,
          mitigationStatus: status,
          mitigationDate,
        });
      }
    }

    // Bearish FVG (SIBI: Sell-Side Imbalance Buy-Side Inefficiency)
    if (candle3.high < candle1.low && candle2.close < candle2.open) {
      const bottom = candle3.high;
      const top = candle1.low;
      const gapSizePct = Number((((top - bottom) / bottom) * 100).toFixed(2));

      if (gapSizePct >= minGapPct) {
        const cePrice = Number(((top + bottom) / 2).toFixed(2));
        let status: FairValueGapZone['mitigationStatus'] = 'UNMITIGATED';
        let mitigationDate: string | undefined;

        for (let j = i + 1; j < bars.length; j++) {
          const subsequent = bars[j];

          if (subsequent.close > top) {
            status = 'INVALIDATED';
            mitigationDate = subsequent.date;
            break;
          }

          if (subsequent.high >= bottom) {
            if (subsequent.high >= top) {
              status = 'MITIGATED';
            } else if (subsequent.high >= cePrice) {
              status = 'PARTIALLY_MITIGATED';
            } else {
              status = 'PARTIALLY_MITIGATED';
            }
            if (!mitigationDate) {
              mitigationDate = subsequent.date;
            }
          }
        }

        fvgs.push({
          type: 'BEARISH',
          candleDate: candle3.date,
          originIndex: i,
          top,
          bottom,
          cePrice,
          gapSizePct,
          mitigationStatus: status,
          mitigationDate,
        });
      }
    }
  }

  return fvgs;
}

/**
 * Returns the most relevant active Bullish FVG zone for current price context.
 */
export function getActiveBullishFVG(
  fvgs: FairValueGapZone[],
  currentPrice: number
): FairValueGapZone | undefined {
  const candidates = fvgs
    .filter(
      (f) =>
        f.type === 'BULLISH' &&
        (f.mitigationStatus === 'UNMITIGATED' || f.mitigationStatus === 'PARTIALLY_MITIGATED') &&
        currentPrice >= f.bottom * 0.98
    )
    .sort((a, b) => b.originIndex - a.originIndex);

  return candidates[0];
}
