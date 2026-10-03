import {
  IntradayBar,
  OrbAssessment,
  InitialBalanceLevels,
} from './types';
import { calculateInitialBalance, extractIbBars } from './ib-calculator';
import { classifyMarketDayType } from './day-classifier';
import { evaluateOrbConfluence } from './confluence';

export * from './types';
export * from './ib-calculator';
export * from './day-classifier';
export * from './confluence';

/**
 * Master evaluation function for Opening Range Breakout (ORB) & Initial Balance (IB) Engine.
 * Evaluates 15-minute Initial Balance (09:00-09:15 WIB), 60-minute Initial Balance (09:00-10:00 WIB),
 * range extension targets, Steidlmayer market day types, and tactical execution regimes.
 */
export function evaluateOpeningRangeBreakout(
  emiten: string,
  tradeDate: string,
  intradayBars: IntradayBar[],
  dailyCloseFallback?: number
): OrbAssessment {
  if (intradayBars.length === 0) {
    const fallbackPrice = dailyCloseFallback || 0;
    const emptyIb: InitialBalanceLevels = {
      high: fallbackPrice,
      low: fallbackPrice,
      range: 0,
      midpoint: fallbackPrice,
      extensionR1: fallbackPrice,
      extensionR2: fallbackPrice,
      extensionS1: fallbackPrice,
      extensionS2: fallbackPrice,
    };

    return {
      emiten,
      tradeDate,
      currentPrice: fallbackPrice,
      ib15: emptyIb,
      ib60: null,
      dayType: 'NEUTRAL_ROTATIONAL_DAY',
      rangeExpansionFactor: 1.0,
      v15mVolume: 0,
      confluenceRegime: 'NEUTRAL_IB',
      convictionScore: 50,
      advisory: 'Data intraday pembukaan belum tersedia untuk evaluasi Opening Range Breakout.',
    };
  }

  // 1. Extract IB15 bars (09:00 to 09:15 WIB) and calculate IB15
  const ib15Bars = extractIbBars(intradayBars, '09:15');
  const ib15 = calculateInitialBalance(ib15Bars.length > 0 ? ib15Bars : intradayBars.slice(0, 3));

  // 2. Extract IB60 bars (09:00 to 10:00 WIB) and calculate IB60
  const ib60Bars = extractIbBars(intradayBars, '10:00');
  const ib60 = ib60Bars.length > 0 ? calculateInitialBalance(ib60Bars) : null;

  // 3. Classify Steidlmayer Market Day Profile
  const dayClassification = classifyMarketDayType(intradayBars, ib15);

  // 4. Calculate total volume during the 15-minute opening window (V15m)
  const v15mVolume = ib15Bars.reduce((sum, b) => sum + (b.volume || 0), 0);

  // 5. Current price is the close of the latest intraday bar
  const latestBar = intradayBars[intradayBars.length - 1];
  const currentPrice = latestBar.close || dailyCloseFallback || 0;

  // 6. Evaluate Tactical Confluence Regime
  const confluence = evaluateOrbConfluence({
    currentPrice,
    ib15,
    dayType: dayClassification.dayType,
    v15mVolume,
  });

  return {
    emiten,
    tradeDate,
    currentPrice,
    ib15,
    ib60,
    dayType: dayClassification.dayType,
    rangeExpansionFactor: dayClassification.rangeExpansionFactor,
    v15mVolume,
    confluenceRegime: confluence.regime,
    convictionScore: confluence.score,
    advisory: confluence.advisory,
  };
}
