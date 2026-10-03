import {
  calculateAvwapFromIndex,
  findBaseTroughIndex,
  findVolumeClimaxIndex,
  find52WeekHighIndex,
} from './avwap-calculator';
import { calculateBandarVwap } from './bandar-benchmark';
import { evaluateVwapConfluence } from './confluence';
import type {
  VwapPriceBar,
  BrokerSummaryItem,
  AnchoredVwapResult,
} from './types';

export * from './types';
export * from './avwap-calculator';
export * from './bandar-benchmark';
export * from './confluence';

/**
 * Master evaluation function that computes Anchored VWAP from structural anchor points
 * (Accumulation Base, Climax Bar, 52w High) along with Bandar VWAP and confluence regimes.
 */
export function evaluateAnchoredVwap(
  emiten: string,
  bars: VwapPriceBar[],
  brokerSummaryItems?: BrokerSummaryItem[]
): AnchoredVwapResult {
  const symbol = emiten.toUpperCase();

  if (!bars || bars.length === 0) {
    const fallbackDate = new Date().toISOString().split('T')[0];
    return {
      emiten: symbol,
      tradeDate: fallbackDate,
      currentPrice: 0,
      baseAnchor: {
        anchorName: 'Base Accumulation Trough',
        anchorDate: fallbackDate,
        anchorIndex: 0,
        vwap: 0,
        upperBand1sd: 0,
        lowerBand1sd: 0,
        upperBand2sd: 0,
        lowerBand2sd: 0,
        stdDev: 0,
        sampleBars: 0,
      },
      volumeClimaxAnchor: null,
      high52wAnchor: null,
      bandarVwapTop3: null,
      bandarVwapTop5: null,
      confluenceRegime: 'AT_INSTITUTIONAL_DEFENSE',
      regimeScore: 50,
      advisory: 'Data historis bar harga tidak tersedia.',
      spreadToBasePct: 0,
      spreadToBandarPct: null,
    };
  }

  const lastBar = bars[bars.length - 1];
  const currentPrice = lastBar.close;
  const tradeDate = lastBar.date;

  // 1. Calculate Base AVWAP (from lowest trough in last 60 bars)
  const baseTroughIdx = findBaseTroughIndex(bars, 60);
  const baseAnchor = calculateAvwapFromIndex(bars, baseTroughIdx, 'Base Accumulation Trough') || {
    anchorName: 'Base Accumulation Trough',
    anchorDate: tradeDate,
    anchorIndex: baseTroughIdx,
    vwap: currentPrice,
    upperBand1sd: currentPrice,
    lowerBand1sd: currentPrice,
    upperBand2sd: currentPrice,
    lowerBand2sd: currentPrice,
    stdDev: 0,
    sampleBars: 1,
  };

  // 2. Calculate Volume Climax AVWAP (from bar with highest volume in last 60 bars)
  const climaxIdx = findVolumeClimaxIndex(bars, 60);
  const volumeClimaxAnchor = calculateAvwapFromIndex(bars, climaxIdx, 'Volume Climax Anchor');

  // 3. Calculate 52-Week High AVWAP
  const high52wIdx = find52WeekHighIndex(bars, 250);
  const high52wAnchor = calculateAvwapFromIndex(bars, high52wIdx, '52-Week High Anchor');

  // 4. Calculate Bandar VWAP from broker summary
  const bandarResult = brokerSummaryItems ? calculateBandarVwap(brokerSummaryItems) : null;
  const bandarVwapTop3 = bandarResult?.bandarVwapTop3 ?? null;
  const bandarVwapTop5 = bandarResult?.bandarVwapTop5 ?? null;

  // 5. Evaluate Multi-Anchor Confluence Regime
  const confluence = evaluateVwapConfluence({
    currentPrice,
    baseAnchor,
    volumeClimaxAnchor,
    high52wAnchor,
    bandarVwapTop3,
  });

  return {
    emiten: symbol,
    tradeDate,
    currentPrice,
    baseAnchor,
    volumeClimaxAnchor,
    high52wAnchor,
    bandarVwapTop3,
    bandarVwapTop5,
    confluenceRegime: confluence.confluenceRegime,
    regimeScore: confluence.regimeScore,
    advisory: confluence.advisory,
    spreadToBasePct: confluence.spreadToBasePct,
    spreadToBandarPct: confluence.spreadToBandarPct,
  };
}
