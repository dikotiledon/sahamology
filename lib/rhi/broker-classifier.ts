import { BrokerSummaryRecord, RetailParticipantMetrics } from './types';

export const RETAIL_BROKERS = new Set(['YP', 'PD', 'XC', 'NI', 'CC', 'GR', 'XL']);
export const WHALE_BROKERS = new Set(['AK', 'BK', 'CS', 'RX', 'ZP', 'KZ', 'CG', 'LG']);

export function isRetailBroker(code: string): boolean {
  return RETAIL_BROKERS.has(code.toUpperCase().trim());
}

export function isWhaleBroker(code: string): boolean {
  return WHALE_BROKERS.has(code.toUpperCase().trim());
}

/**
 * Aggregates retail participant turnover, net buy value, and top retail actors.
 */
export function extractRetailMetrics(
  records: BrokerSummaryRecord[],
  totalTurnover: number
): RetailParticipantMetrics {
  const retailRecords = records.filter((r) => isRetailBroker(r.brokerCode));

  let retailGrossValue = 0;
  let retailNetBuyValue = 0;

  let topRetailBuyer: string | null = null;
  let maxRetailBuy = 0;

  let topRetailSeller: string | null = null;
  let maxRetailSell = 0;

  for (const r of retailRecords) {
    const gross = (r.buyValue || 0) + (r.sellValue || 0);
    retailGrossValue += gross;
    retailNetBuyValue += r.netValue || 0;

    if (r.netValue > maxRetailBuy) {
      maxRetailBuy = r.netValue;
      topRetailBuyer = r.brokerCode.toUpperCase();
    }
    if (r.netValue < maxRetailSell) {
      maxRetailSell = r.netValue;
      topRetailSeller = r.brokerCode.toUpperCase();
    }
  }

  const retailParticipationRatio =
    totalTurnover > 0 ? Number((retailGrossValue / totalTurnover).toFixed(4)) : 0;

  return {
    retailGrossValue,
    retailNetBuyValue,
    retailParticipationRatio,
    topRetailBuyer,
    topRetailSeller,
  };
}
