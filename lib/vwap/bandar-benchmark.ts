import type { BrokerSummaryItem } from './types';

export interface BandarBenchmarkResult {
  bandarVwapTop3: number | null;
  bandarVwapTop5: number | null;
  topBuyersCount: number;
}

/**
 * Calculates the volume-weighted average price (Bandar VWAP) of the top-3 and top-5
 * accumulating brokers from End-of-Day broker summary records.
 * On IDX, 1 lot = 100 shares.
 */
export function calculateBandarVwap(items: BrokerSummaryItem[]): BandarBenchmarkResult {
  if (!items || items.length === 0) {
    return {
      bandarVwapTop3: null,
      bandarVwapTop5: null,
      topBuyersCount: 0,
    };
  }

  // Filter only brokers with positive net buy values and lots
  const buyers = items
    .filter((b) => b.netBuyValue > 0 && b.netBuyLot > 0)
    .sort((a, b) => b.netBuyValue - a.netBuyValue);

  if (buyers.length === 0) {
    return {
      bandarVwapTop3: null,
      bandarVwapTop5: null,
      topBuyersCount: 0,
    };
  }

  // 1. Top 3 Bandar VWAP
  const top3 = buyers.slice(0, 3);
  let top3Value = 0;
  let top3Shares = 0;
  for (const b of top3) {
    top3Value += b.netBuyValue;
    top3Shares += b.netBuyLot * 100;
  }
  const bandarVwapTop3 = top3Shares > 0 ? Number((top3Value / top3Shares).toFixed(2)) : null;

  // 2. Top 5 Bandar VWAP
  const top5 = buyers.slice(0, 5);
  let top5Value = 0;
  let top5Shares = 0;
  for (const b of top5) {
    top5Value += b.netBuyValue;
    top5Shares += b.netBuyLot * 100;
  }
  const bandarVwapTop5 = top5Shares > 0 ? Number((top5Value / top5Shares).toFixed(2)) : null;

  return {
    bandarVwapTop3,
    bandarVwapTop5,
    topBuyersCount: buyers.length,
  };
}
