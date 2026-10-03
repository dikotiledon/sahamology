import type { PriceBar, TrendTemplateResult } from './types';

/**
 * Calculates Simple Moving Average (SMA) of an array of numbers.
 */
export function calculateSma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const slice = values.slice(-period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return Number((sum / period).toFixed(2));
}

/**
 * Evaluates Mark Minervini's 6-Point Trend Template for institutional Stage 2 identification.
 */
export function evaluateTrendTemplate(bars: PriceBar[]): TrendTemplateResult {
  if (!bars || bars.length < 50) {
    const currentPrice = bars && bars.length > 0 ? bars[bars.length - 1].close : 0;
    return {
      passed: false,
      priceAboveSma50: false,
      priceAboveSma150: false,
      priceAboveSma200: false,
      smaAlignment: false,
      sma200TrendingUp: false,
      within25Pct52wHigh: false,
      atLeast25PctAbove52wLow: false,
      currentPrice,
      sma50: 0,
      sma150: 0,
      sma200: 0,
      high52w: currentPrice,
      low52w: currentPrice,
      pctFrom52wHigh: 0,
      pctFrom52wLow: 0,
    };
  }

  const closes = bars.map((b) => b.close);
  const currentPrice = closes[closes.length - 1];

  // 52-Week (approx. 250 trading sessions) High & Low
  const trailing52wBars = bars.slice(-250);
  const high52w = Math.max(...trailing52wBars.map((b) => b.high));
  const low52w = Math.min(...trailing52wBars.map((b) => b.low));

  const pctFrom52wHigh = high52w > 0
    ? Number((((high52w - currentPrice) / high52w) * 100).toFixed(2))
    : 0;

  const pctFrom52wLow = low52w > 0
    ? Number((((currentPrice - low52w) / low52w) * 100).toFixed(2))
    : 0;

  // Moving averages
  const sma50 = calculateSma(closes, 50) ?? currentPrice;
  const sma150 = calculateSma(closes, 150) ?? (calculateSma(closes, Math.min(closes.length, 100)) ?? currentPrice);
  const sma200 = calculateSma(closes, 200) ?? (calculateSma(closes, Math.min(closes.length, 150)) ?? currentPrice);

  // SMA 200 Slope over past 20 bars
  let sma200TrendingUp = false;
  if (closes.length >= 220) {
    const prevCloses = closes.slice(0, closes.length - 20);
    const prevSma200 = calculateSma(prevCloses, 200);
    if (prevSma200 !== null && sma200 > prevSma200) {
      sma200TrendingUp = true;
    }
  } else if (closes.length >= 70) {
    // If fewer than 220 bars, evaluate slope on the longest available window
    const windowSize = Math.min(closes.length - 20, 200);
    const currentSmaLong = calculateSma(closes, windowSize) ?? currentPrice;
    const prevCloses = closes.slice(0, closes.length - 20);
    const prevSmaLong = calculateSma(prevCloses, windowSize) ?? currentPrice;
    sma200TrendingUp = currentSmaLong >= prevSmaLong;
  } else {
    sma200TrendingUp = sma50 >= sma150;
  }

  // 1. Price above key moving averages
  const priceAboveSma50 = currentPrice > sma50;
  const priceAboveSma150 = currentPrice > sma150;
  const priceAboveSma200 = currentPrice > sma200;

  // 2. Moving average alignment: 50 > 150 > 200
  const smaAlignment = sma50 >= sma150 && sma150 >= sma200;

  // 3. Proximity to 52-week high (within 25%)
  const within25Pct52wHigh = pctFrom52wHigh <= 25.0;

  // 4. Distance from 52-week low (at least 25% above)
  const atLeast25PctAbove52wLow = pctFrom52wLow >= 25.0;

  const passed =
    priceAboveSma50 &&
    priceAboveSma150 &&
    priceAboveSma200 &&
    smaAlignment &&
    sma200TrendingUp &&
    within25Pct52wHigh &&
    atLeast25PctAbove52wLow;

  return {
    passed,
    priceAboveSma50,
    priceAboveSma150,
    priceAboveSma200,
    smaAlignment,
    sma200TrendingUp,
    within25Pct52wHigh,
    atLeast25PctAbove52wLow,
    currentPrice,
    sma50,
    sma150,
    sma200,
    high52w,
    low52w,
    pctFrom52wHigh,
    pctFrom52wLow,
  };
}
