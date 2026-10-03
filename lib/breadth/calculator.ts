import { classifyMarketRegime } from './regime-classifier';
import type { BreadthConstituent, MarketBreadthMetric } from './types';

/**
 * Calculates aggregate market breadth metrics across an analyzed universe of IDX emitens.
 */
export function calculateMarketBreadth(
  tradeDate: string,
  constituents: BreadthConstituent[]
): MarketBreadthMetric {
  if (!constituents || constituents.length === 0) {
    return {
      tradeDate,
      advancers: 0,
      decliners: 0,
      unchanged: 0,
      adRatio: 1.0,
      pctAboveEma20: 0.0,
      pctAboveSma50: 0.0,
      pctAboveSma200: 0.0,
      newHighs52w: 0,
      newLows52w: 0,
      netNewHighs: 0,
      netForeignFlow: 0.0,
      constituentCount: 0,
      marketRegime: 'BULLISH_EXPANSION',
      regimeScore: 50,
      advisory: 'Data konstituen pasar kosong atau belum tersedia.',
    };
  }

  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;

  let countAboveEma20 = 0;
  let validEma20Count = 0;

  let countAboveSma50 = 0;
  let validSma50Count = 0;

  let countAboveSma200 = 0;
  let validSma200Count = 0;

  let newHighs52w = 0;
  let newLows52w = 0;

  let totalForeignNet = 0;

  for (const c of constituents) {
    // 1. Advance / Decline
    if (c.close > c.prevClose) {
      advancers++;
    } else if (c.close < c.prevClose) {
      decliners++;
    } else {
      unchanged++;
    }

    // 2. Moving average participation
    if (c.ema20 != null && c.ema20 > 0) {
      validEma20Count++;
      if (c.close > c.ema20) countAboveEma20++;
    }
    if (c.sma50 != null && c.sma50 > 0) {
      validSma50Count++;
      if (c.close > c.sma50) countAboveSma50++;
    }
    if (c.sma200 != null && c.sma200 > 0) {
      validSma200Count++;
      if (c.close > c.sma200) countAboveSma200++;
    }

    // 3. 52-week High/Low expansion (within 2% threshold)
    if (c.high52w != null && c.high52w > 0) {
      if (c.close >= c.high52w * 0.98) {
        newHighs52w++;
      }
    }
    if (c.low52w != null && c.low52w > 0) {
      if (c.close <= c.low52w * 1.02) {
        newLows52w++;
      }
    }

    // 4. Foreign net flow
    if (c.foreignNetValue != null) {
      totalForeignNet += c.foreignNetValue;
    }
  }

  const constituentCount = constituents.length;
  const adRatio = decliners > 0
    ? Number((advancers / decliners).toFixed(2))
    : Number(advancers.toFixed(2));

  const pctAboveEma20 = validEma20Count > 0
    ? Number(((countAboveEma20 / validEma20Count) * 100).toFixed(2))
    : 0;

  const pctAboveSma50 = validSma50Count > 0
    ? Number(((countAboveSma50 / validSma50Count) * 100).toFixed(2))
    : 0;

  const pctAboveSma200 = validSma200Count > 0
    ? Number(((countAboveSma200 / validSma200Count) * 100).toFixed(2))
    : 0;

  const netNewHighs = newHighs52w - newLows52w;

  const regimeClassification = classifyMarketRegime({
    pctAboveEma20,
    pctAboveSma50,
    pctAboveSma200,
    adRatio,
    netNewHighs,
    netForeignFlow: totalForeignNet,
  });

  return {
    tradeDate,
    advancers,
    decliners,
    unchanged,
    adRatio,
    pctAboveEma20,
    pctAboveSma50,
    pctAboveSma200,
    newHighs52w,
    newLows52w,
    netNewHighs,
    netForeignFlow: totalForeignNet,
    constituentCount,
    marketRegime: regimeClassification.regime,
    regimeScore: regimeClassification.score,
    advisory: regimeClassification.advisory,
  };
}
