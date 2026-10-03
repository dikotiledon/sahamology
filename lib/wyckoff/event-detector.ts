import type { WyckoffBar, TradingRange, VsaMetrics, WyckoffEventOccurrence } from './types';
import { calculateVsaMetrics } from './vsa';

export function detectSellingClimax(
  bars: WyckoffBar[],
  index: number,
  vsa: VsaMetrics
): WyckoffEventOccurrence | null {
  const bar = bars[index];

  // Need elevated volume (at least 2.0x, ideally >= 2.5x)
  if (vsa.relativeVolume < 2.0) return null;

  // Spread should be relatively wide
  if (vsa.relativeSpread < 1.3) return null;

  // Check if this bar establishes a distinct local low across preceding lookback (>= 15 bars)
  const lookbackStart = Math.max(0, index - 15);
  const priorBars = bars.slice(lookbackStart, index);
  if (priorBars.length > 0) {
    const minPriorLow = Math.min(...priorBars.map((b) => b.low));
    if (bar.low > minPriorLow) return null;
  }

  // Must have buying tail / absorption: close is off the absolute low
  if (vsa.closePosition < 0.2) return null;

  return {
    type: 'SELLING_CLIMAX',
    date: bar.date,
    price: bar.low,
    relativeVolume: vsa.relativeVolume,
    relativeSpread: vsa.relativeSpread,
    closePosition: vsa.closePosition,
    notes: `Selling Climax: extreme volume (${vsa.relativeVolume}x) with absorption off low (${Math.round(vsa.closePosition * 100)}% close pos).`,
  };
}

export function detectSpring(
  bars: WyckoffBar[],
  index: number,
  range: TradingRange,
  vsa: VsaMetrics,
  aqsScore?: number
): WyckoffEventOccurrence | null {
  const bar = bars[index];

  // Price must pierce strictly below Ice
  if (bar.low >= range.iceSupport) return null;

  // But the close must recover back at or inside the trading range
  if (bar.close < range.iceSupport) return null;

  // Penetration shouldn't be catastrophic breakdown (up to -5% below Ice)
  const breachPct = ((range.iceSupport - bar.low) / range.iceSupport) * 100;
  if (breachPct > 6.0) return null;

  // Spring validation: either low volume test (< 1.2x) OR high volume shakeout absorbed by whales (AQS >= 60)
  const isLowVolumeSpring = vsa.relativeVolume <= 1.2;
  const isHighVolumeShakeout = vsa.relativeVolume > 1.2 && (vsa.closePosition >= 0.4 || (aqsScore ?? 0) >= 60);

  if (!isLowVolumeSpring && !isHighVolumeShakeout) {
    return null;
  }

  return {
    type: 'SPRING',
    date: bar.date,
    price: bar.low,
    relativeVolume: vsa.relativeVolume,
    relativeSpread: vsa.relativeSpread,
    closePosition: vsa.closePosition,
    aqsScore,
    notes: `Spring: breached Ice (${range.iceSupport}) to ${bar.low} (-${breachPct.toFixed(1)}%) and closed at ${bar.close}. ${
      isLowVolumeSpring ? 'Low supply test.' : 'High volume absorption shakeout.'
    }`,
  };
}

export function detectSignOfStrength(
  bars: WyckoffBar[],
  index: number,
  range: TradingRange,
  vsa: VsaMetrics
): WyckoffEventOccurrence | null {
  const bar = bars[index];

  // Strong bullish candle
  if (bar.close <= bar.open) return null;

  // Expanding volume and wide spread
  if (vsa.relativeVolume < 1.4 || vsa.relativeSpread < 1.2) return null;

  // Strong close in upper portion of bar
  if (vsa.closePosition < 0.65) return null;

  // Bar is moving above midpoint or towards Creek
  if (bar.close < range.midpoint) return null;

  return {
    type: 'SIGN_OF_STRENGTH',
    date: bar.date,
    price: bar.close,
    relativeVolume: vsa.relativeVolume,
    relativeSpread: vsa.relativeSpread,
    closePosition: vsa.closePosition,
    notes: `Sign of Strength: wide spread rally on expanding volume (${vsa.relativeVolume}x), closing near high (${bar.close}).`,
  };
}

export function detectLastPointOfSupport(
  bars: WyckoffBar[],
  index: number,
  range: TradingRange,
  vsa: VsaMetrics
): WyckoffEventOccurrence | null {
  const bar = bars[index];

  // Shallow pullback holding above Ice (typically above midpoint or higher low)
  if (bar.low < range.midpoint) return null;

  // Volume contraction on pullback
  if (vsa.relativeVolume > 1.0) return null;

  // Narrow or subdued spread
  if (vsa.relativeSpread > 1.1) return null;

  return {
    type: 'LAST_POINT_OF_SUPPORT',
    date: bar.date,
    price: bar.low,
    relativeVolume: vsa.relativeVolume,
    relativeSpread: vsa.relativeSpread,
    closePosition: vsa.closePosition,
    notes: `Last Point of Support: low-volume pullback (${vsa.relativeVolume}x) holding support above range midpoint at ${bar.low}.`,
  };
}

export function detectUpthrust(
  bars: WyckoffBar[],
  index: number,
  range: TradingRange,
  vsa: VsaMetrics
): WyckoffEventOccurrence | null {
  const bar = bars[index];

  // High penetrates above Creek
  if (bar.high <= range.creekResistance) return null;

  // But close fails and drops back inside range below Creek
  if (bar.close > range.creekResistance) return null;

  // Weak close position (in lower 45% of bar)
  if (vsa.closePosition > 0.45) return null;

  return {
    type: 'UPTHRUST',
    date: bar.date,
    price: bar.high,
    relativeVolume: vsa.relativeVolume,
    relativeSpread: vsa.relativeSpread,
    closePosition: vsa.closePosition,
    notes: `Upthrust: pierced Creek (${range.creekResistance}) to ${bar.high} but rejected to close at ${bar.close}.`,
  };
}

export function detectStructuralEvents(
  bars: WyckoffBar[],
  range: TradingRange,
  aqsScores?: Record<string, number>
): WyckoffEventOccurrence[] {
  const events: WyckoffEventOccurrence[] = [];
  const startIndex = 1;

  for (let i = startIndex; i < bars.length; i++) {
    const vsa = calculateVsaMetrics(bars, i);
    const date = bars[i].date;
    const aqs = aqsScores?.[date];

    // Priority checks
    const sc = detectSellingClimax(bars, i, vsa);
    if (sc) events.push(sc);

    const spring = detectSpring(bars, i, range, vsa, aqs);
    if (spring) events.push(spring);

    const sos = detectSignOfStrength(bars, i, range, vsa);
    if (sos) events.push(sos);

    const lps = detectLastPointOfSupport(bars, i, range, vsa);
    if (lps) events.push(lps);

    const ut = detectUpthrust(bars, i, range, vsa);
    if (ut) events.push(ut);
  }

  return events;
}
