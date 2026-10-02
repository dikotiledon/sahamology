import type { MarketDetectorResponse } from '../types';
import type { BrokerSummaryEntry } from './types';

/**
 * Maps raw MarketDetectorResponse broker summaries to canonical BrokerSummaryEntry array.
 */
export function marketDetectorToBrokerEntries(detector: MarketDetectorResponse): BrokerSummaryEntry[] {
  if (!detector?.data?.broker_summary) return [];

  const buyItems = detector.data.broker_summary.brokers_buy || [];
  const sellItems = detector.data.broker_summary.brokers_sell || [];

  const map = new Map<string, BrokerSummaryEntry>();

  for (const b of buyItems) {
    const code = (b.netbs_broker_code || '').trim().toUpperCase();
    if (!code) continue;

    const buyValue = Number(b.bval) || 0;
    const buyVolume = Number(b.blot) || 0;
    const avgBuyPrice = Number(b.netbs_buy_avg_price) || 0;

    map.set(code, {
      brokerCode: code,
      buyVolume,
      buyValue,
      sellVolume: 0,
      sellValue: 0,
      netVolume: buyVolume,
      netValue: buyValue,
      avgBuyPrice,
      avgSellPrice: 0,
    });
  }

  for (const s of sellItems) {
    const code = (s.netbs_broker_code || '').trim().toUpperCase();
    if (!code) continue;

    const sellValue = Number(s.sval) || 0;
    const sellVolume = Number(s.slot) || 0;
    const avgSellPrice = Number(s.netbs_sell_avg_price) || 0;

    const existing = map.get(code);
    if (existing) {
      existing.sellVolume = sellVolume;
      existing.sellValue = sellValue;
      existing.netVolume = existing.buyVolume - sellVolume;
      existing.netValue = existing.buyValue - sellValue;
      existing.avgSellPrice = avgSellPrice;
    } else {
      map.set(code, {
        brokerCode: code,
        buyVolume: 0,
        buyValue: 0,
        sellVolume,
        sellValue,
        netVolume: -sellVolume,
        netValue: -sellValue,
        avgBuyPrice: 0,
        avgSellPrice,
      });
    }
  }

  return Array.from(map.values());
}
