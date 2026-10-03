import { WeeklyBar, WeeklyMetrics, WeinsteinStage } from './types';

/**
 * Calculates an Exponential Moving Average (EMA) series over an array of numbers.
 */
export function calculateEmaSeries(values: number[], period: number): (number | null)[] {
  if (values.length < period) {
    return new Array(values.length).fill(null);
  }

  const result: (number | null)[] = new Array(period - 1).fill(null);
  
  // Seed with SMA of the first `period` elements
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let prevEma = sum / period;
  result.push(Number(prevEma.toFixed(2)));

  const multiplier = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    const currentEma = (values[i] - prevEma) * multiplier + prevEma;
    result.push(Number(currentEma.toFixed(2)));
    prevEma = currentEma;
  }

  return result;
}

/**
 * Analyzes synthetic weekly bars to assess macro secular momentum,
 * 10w/30w EMAs, slope of 30w EMA, and Stan Weinstein Stages 1 through 4.
 */
export function analyzeWeeklyTrend(weeklyBars: WeeklyBar[]): WeeklyMetrics {
  const count = weeklyBars.length;

  if (count < 10) {
    return {
      stage: 'STAGE_UNKNOWN',
      weeklyEma10: null,
      weeklyEma30: null,
      slope30wPct: null,
      weeklyBarsCount: count,
      isExpansion: false,
    };
  }

  const closePrices = weeklyBars.map((b) => b.close);
  const ema10Series = calculateEmaSeries(closePrices, 10);
  const ema30Series = calculateEmaSeries(closePrices, Math.min(30, Math.max(10, count)));

  const latestClose = closePrices[count - 1];
  const latestEma10 = ema10Series[count - 1];
  const latestEma30 = ema30Series[count - 1];

  let slope30wPct: number | null = null;
  const lookback = 4;
  if (count >= 15 && latestEma30 !== null) {
    const pastEma30 = ema30Series[count - 1 - lookback];
    if (pastEma30 !== null && pastEma30 > 0) {
      slope30wPct = Number((((latestEma30 - pastEma30) / pastEma30) * 100).toFixed(2));
    }
  }

  let stage: WeinsteinStage = 'STAGE_UNKNOWN';

  if (latestEma10 !== null && latestEma30 !== null) {
    const slope = slope30wPct ?? 0;
    const diffPctFromEma30 = ((latestClose - latestEma30) / latestEma30) * 100;

    if (latestClose > latestEma10 && latestEma10 >= latestEma30 && slope >= 0) {
      stage = 'STAGE_2_EXPANSION';
    } else if (latestClose < latestEma10 && latestEma10 <= latestEma30 && slope <= 0) {
      stage = 'STAGE_4_CAPITULATION';
    } else if (Math.abs(slope) <= 1.5 && Math.abs(diffPctFromEma30) <= 8.0) {
      stage = 'STAGE_1_BASING';
    } else if (latestClose < latestEma10 && latestEma10 >= latestEma30) {
      // Pullback within Stage 2 or transitioning to Stage 3
      stage = slope > 0.5 ? 'STAGE_2_EXPANSION' : 'STAGE_3_DISTRIBUTION';
    } else if (latestClose > latestEma10 && latestEma10 < latestEma30) {
      // Counter-trend rally in Stage 4 or early Stage 1 breakout
      stage = slope < -0.5 ? 'STAGE_4_CAPITULATION' : 'STAGE_1_BASING';
    } else {
      stage = slope >= 0 ? 'STAGE_2_EXPANSION' : 'STAGE_4_CAPITULATION';
    }
  } else if (latestEma10 !== null) {
    // If fewer than 30 weeks but >= 10 weeks
    if (latestClose > latestEma10) {
      stage = 'STAGE_2_EXPANSION';
    } else {
      stage = 'STAGE_4_CAPITULATION';
    }
  }

  return {
    stage,
    weeklyEma10: latestEma10,
    weeklyEma30: latestEma30,
    slope30wPct,
    weeklyBarsCount: count,
    isExpansion: stage === 'STAGE_2_EXPANSION',
  };
}
