import { IntradayBar, InitialBalanceLevels, DayType } from './types';

export interface DayClassificationResult {
  dayType: DayType;
  rangeExpansionFactor: number;
  dayHigh: number;
  dayLow: number;
}

/**
 * Classifies the trading session using the Steidlmayer Auction Market Profile framework
 * based on the relationship between total session range and the 15-minute Initial Balance (IB15).
 */
export function classifyMarketDayType(
  allBars: IntradayBar[],
  ib15: InitialBalanceLevels
): DayClassificationResult {
  if (allBars.length === 0 || ib15.range <= 0) {
    const fallbackPrice = allBars.length > 0 ? allBars[allBars.length - 1].close : 0;
    return {
      dayType: 'NEUTRAL_ROTATIONAL_DAY',
      rangeExpansionFactor: 1.0,
      dayHigh: fallbackPrice,
      dayLow: fallbackPrice,
    };
  }

  let dayHigh = -Infinity;
  let dayLow = Infinity;

  for (const bar of allBars) {
    if (bar.high > dayHigh) dayHigh = bar.high;
    if (bar.low < dayLow) dayLow = bar.low;
  }

  const dayRange = Number((dayHigh - dayLow).toFixed(2));
  const rangeExpansionFactor = Number((dayRange / ib15.range).toFixed(2));

  // Check for false breakout trap: price pushed outside IB but rejected back inside midpoint
  const postIbBars = allBars.filter((b) => b.time > '09:15');
  let probedAboveHigh = false;
  let probedBelowLow = false;
  let closedBelowMidAfterHighProbe = false;
  let closedAboveMidAfterLowProbe = false;

  for (const bar of postIbBars) {
    if (bar.high > ib15.high && bar.high <= ib15.high + 0.3 * ib15.range) {
      probedAboveHigh = true;
    }
    if (bar.low < ib15.low && bar.low >= ib15.low - 0.3 * ib15.range) {
      probedBelowLow = true;
    }
    if (probedAboveHigh && bar.close < ib15.midpoint) {
      closedBelowMidAfterHighProbe = true;
    }
    if (probedBelowLow && bar.close > ib15.midpoint) {
      closedAboveMidAfterLowProbe = true;
    }
  }

  let dayType: DayType;

  if (closedBelowMidAfterHighProbe || closedAboveMidAfterLowProbe) {
    dayType = 'FAILED_BREAKOUT_TRAP';
  } else if (rangeExpansionFactor >= 2.0) {
    dayType = 'TREND_DAY_EXPANSION';
  } else if (rangeExpansionFactor >= 1.25) {
    dayType = 'NORMAL_VARIATION_DAY';
  } else {
    dayType = 'NEUTRAL_ROTATIONAL_DAY';
  }

  return {
    dayType,
    rangeExpansionFactor,
    dayHigh,
    dayLow,
  };
}
