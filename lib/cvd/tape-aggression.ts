import { TapeAggression } from './types';

/**
 * Calculates Foreign Tape Aggression Ratio and participant order flow dominance.
 */
export function calculateTapeAggression(
  foreignBuyValue: number,
  foreignSellValue: number
): TapeAggression {
  const buy = Math.max(0, foreignBuyValue || 0);
  const sell = Math.max(0, foreignSellValue || 0);
  const total = buy + sell;

  if (total <= 0) {
    return {
      foreignBuyValue: 0,
      foreignSellValue: 0,
      aggressionRatio: 0.5,
      status: 'BALANCED',
    };
  }

  const aggressionRatio = Number((buy / total).toFixed(4));

  let status: TapeAggression['status'] = 'BALANCED';
  if (aggressionRatio >= 0.65) {
    status = 'DOMINANT_BUY_AGGRESSION';
  } else if (aggressionRatio <= 0.35) {
    status = 'DOMINANT_SELL_AGGRESSION';
  }

  return {
    foreignBuyValue: buy,
    foreignSellValue: sell,
    aggressionRatio,
    status,
  };
}
