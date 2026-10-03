import type { WyckoffBar, WyckoffAssessment, WyckoffPhase } from './types';
import { detectTradingRange } from './range-finder';
import { detectStructuralEvents } from './event-detector';

export function classifyWyckoffStructure(params: {
  emiten: string;
  bars: WyckoffBar[];
  aqsScores?: Record<string, number>;
}): WyckoffAssessment {
  const { emiten, bars, aqsScores } = params;

  if (!bars || bars.length < 25) {
    return {
      emiten,
      asOfDate: bars && bars.length > 0 ? bars[bars.length - 1].date : '',
      phase: 'WYCKOFF_UNCLASSIFIED',
      confidenceScore: 0,
      markupReadinessScore: 0,
      tradingRange: null,
      activeEvents: [],
      springDetected: false,
      confluenceTags: ['INSUFFICIENT_HISTORY'],
    };
  }

  const asOfDate = bars[bars.length - 1].date;
  const latestBar = bars[bars.length - 1];
  const tradingRange = detectTradingRange(bars);

  if (!tradingRange) {
    return {
      emiten,
      asOfDate,
      phase: 'WYCKOFF_UNCLASSIFIED',
      confidenceScore: 10,
      markupReadinessScore: 10,
      tradingRange: null,
      activeEvents: [],
      springDetected: false,
      confluenceTags: ['NO_CONSOLIDATION_RANGE_FOUND'],
    };
  }

  const events = detectStructuralEvents(bars, tradingRange, aqsScores);
  const confluenceTags: string[] = [];

  // Check recent events (within last 5 bars)
  const recentEvents = events.filter((e) => {
    const eventIdx = bars.findIndex((b) => b.date === e.date);
    return eventIdx >= bars.length - 5;
  });

  // Check medium-term events (within last 15 bars)
  const mediumEvents = events.filter((e) => {
    const eventIdx = bars.findIndex((b) => b.date === e.date);
    return eventIdx >= bars.length - 15;
  });

  const recentSpring = recentEvents.find((e) => e.type === 'SPRING');
  const recentSos = mediumEvents.find((e) => e.type === 'SIGN_OF_STRENGTH');
  const recentUt = recentEvents.find((e) => e.type === 'UPTHRUST' || e.type === 'UTAD');
  const recentSc = mediumEvents.find((e) => e.type === 'SELLING_CLIMAX');

  let phase: WyckoffPhase;
  let confidenceScore: number;
  let markupReadinessScore: number;
  let springDetected = false;
  let springLow: number | undefined;

  // Determine structural phase
  if (tradingRange.status === 'BROKEN_OUT_UP' || latestBar.close > tradingRange.creekResistance * 1.02) {
    phase = 'PHASE_E_MARKUP';
    confidenceScore = 90;
    markupReadinessScore = 95;
    confluenceTags.push('CREEK_BREAKOUT');
  } else if (
    tradingRange.status === 'BROKEN_OUT_DOWN' ||
    latestBar.close < tradingRange.iceSupport * 0.96 ||
    (recentUt && latestBar.close < tradingRange.midpoint)
  ) {
    phase = 'PHASE_DISTRIBUTION';
    confidenceScore = 75;
    markupReadinessScore = 15;
    confluenceTags.push('ICE_BREAKDOWN');
  } else if (recentSpring && latestBar.close >= tradingRange.iceSupport) {
    phase = 'PHASE_C_SPRING';
    springDetected = true;
    springLow = recentSpring.price;
    confidenceScore = 85;
    markupReadinessScore = 85;
    confluenceTags.push('SPRING_SUPPLY_TEST_CONFIRMED');
  } else if (recentSos && latestBar.close >= tradingRange.midpoint) {
    phase = 'PHASE_D_TRANSITION';
    confidenceScore = 75;
    markupReadinessScore = 75;
    confluenceTags.push('SIGN_OF_STRENGTH_ACTIVE');
  } else if (recentSc && bars.findIndex((b) => b.date === recentSc.date) >= bars.length - 10) {
    phase = 'PHASE_A_STOPPING';
    confidenceScore = 65;
    markupReadinessScore = 25;
    confluenceTags.push('STOPPING_ACTION_PRESENT');
  } else {
    phase = 'PHASE_B_ABSORPTION';
    confidenceScore = 70;
    markupReadinessScore = 50;
  }

  // Brosum AQS confluence multiplier
  const latestAqs = aqsScores?.[asOfDate];
  if (latestAqs !== undefined && latestAqs >= 70) {
    confluenceTags.push('HIGH_INSTITUTIONAL_ABSORPTION');
    confidenceScore = Math.min(100, confidenceScore + 5);
    if (phase === 'PHASE_C_SPRING' || phase === 'PHASE_D_TRANSITION') {
      markupReadinessScore = Math.min(100, markupReadinessScore + 5);
    }
  }

  return {
    emiten,
    asOfDate,
    phase,
    confidenceScore,
    markupReadinessScore,
    tradingRange,
    activeEvents: events.slice(-10),
    springDetected,
    springLow,
    confluenceTags,
  };
}
