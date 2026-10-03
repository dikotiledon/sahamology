import { DailyPriceBar, DailyMetrics, DailyTrendState } from './types';
import { calculateEmaSeries } from './weekly-analyzer';

/**
 * Calculates a Simple Moving Average (SMA) series over an array of numbers.
 */
export function calculateSmaSeries(values: number[], period: number): (number | null)[] {
  if (values.length < period) {
    return new Array(values.length).fill(null);
  }

  const result: (number | null)[] = new Array(period - 1).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += values[i - j];
    }
    result.push(Number((sum / period).toFixed(2)));
  }

  return result;
}

/**
 * Analyzes intermediate daily price bars, calculating EMA20, SMA50, SMA200,
 * and determining the daily wave trend state.
 */
export function analyzeDailyTrend(dailyBars: DailyPriceBar[]): DailyMetrics {
  const count = dailyBars.length;

  if (count === 0) {
    return {
      trendState: 'NEUTRAL',
      dailyEma20: null,
      dailySma50: null,
      dailySma200: null,
      priceAboveEma20: false,
      priceAboveSma50: false,
      priceAboveSma200: false,
    };
  }

  const closePrices = dailyBars.map((b) => b.close);
  const ema20Series = calculateEmaSeries(closePrices, Math.min(20, count));
  const sma50Series = calculateSmaSeries(closePrices, Math.min(50, count));
  const sma200Series = calculateSmaSeries(closePrices, Math.min(200, count));

  const latestClose = closePrices[count - 1];
  const latestEma20 = ema20Series[count - 1];
  const latestSma50 = sma50Series[count - 1];
  const latestSma200 = sma200Series[count - 1];

  const priceAboveEma20 = latestEma20 !== null ? latestClose >= latestEma20 : false;
  const priceAboveSma50 = latestSma50 !== null ? latestClose >= latestSma50 : false;
  const priceAboveSma200 = latestSma200 !== null ? latestClose >= latestSma200 : false;

  let trendState: DailyTrendState = 'NEUTRAL';

  if (latestEma20 !== null && latestSma50 !== null) {
    if (latestClose >= latestEma20 && latestEma20 >= latestSma50) {
      trendState = 'BULLISH_EXPANSION';
    } else if (latestClose < latestEma20 && latestClose >= latestSma50) {
      trendState = 'PULLBACK_SUPPORT';
    } else if (latestClose < latestEma20 && latestClose < latestSma50) {
      trendState = 'BEARISH_CONTRACTION';
    } else {
      trendState = latestClose >= latestEma20 ? 'BULLISH_EXPANSION' : 'NEUTRAL';
    }
  } else if (latestEma20 !== null) {
    trendState = latestClose >= latestEma20 ? 'BULLISH_EXPANSION' : 'BEARISH_CONTRACTION';
  }

  return {
    trendState,
    dailyEma20: latestEma20,
    dailySma50: latestSma50,
    dailySma200: latestSma200,
    priceAboveEma20,
    priceAboveSma50,
    priceAboveSma200,
  };
}
