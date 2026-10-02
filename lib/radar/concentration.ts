import type { BrokerSummaryEntry, ConcentrationMetrics } from './types';

/**
 * Calculates concentration metrics and structural asymmetry from broker summary entries.
 *
 * Implements Metric 1 of IDX Insider Accumulation:
 * - Extreme concentration ratio: Top 1-3 brokers absorbing 60-85% of net buy turnover
 * - Seller dispersion: Many retail sellers (low Herfindahl index, high seller count)
 * - Buyer average price clustering: Narrow spread across top accumulating brokers (iceberg execution)
 */
export function calculateConcentration(entries: BrokerSummaryEntry[]): ConcentrationMetrics {
  if (!entries || entries.length === 0) {
    return {
      top1NetValueRatio: 0,
      top3NetValueRatio: 0,
      retailDispersionIndex: 0,
      sellerCount: 0,
      buyerPriceClusteringPct: 0,
      isExtremeConcentration: false,
    };
  }

  // Filter positive net buyers and sort descending by net value
  const buyers = entries
    .filter((e) => e.netValue > 0)
    .sort((a, b) => b.netValue - a.netValue);

  // Filter net sellers and sort by absolute net value descending
  const sellers = entries
    .filter((e) => e.netValue < 0)
    .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));

  const totalNetBuy = buyers.reduce((sum, b) => sum + b.netValue, 0);
  const totalNetSell = sellers.reduce((sum, s) => sum + Math.abs(s.netValue), 0);

  const top1NetBuy = buyers.length > 0 ? buyers[0].netValue : 0;
  const top3NetBuy = buyers.slice(0, 3).reduce((sum, b) => sum + b.netValue, 0);

  const top1NetValueRatio = totalNetBuy > 0 ? Math.min(1, Math.max(0, top1NetBuy / totalNetBuy)) : 0;
  const top3NetValueRatio = totalNetBuy > 0 ? Math.min(1, Math.max(0, top3NetBuy / totalNetBuy)) : 0;

  // Retail dispersion: Herfindahl-Hirschman Index (HHI) over sellers
  // HHI = sum((s_i / total)^2). When dispersed across N sellers equally, HHI = 1/N.
  let retailDispersionIndex = 0;
  if (totalNetSell > 0 && sellers.length > 0) {
    retailDispersionIndex = sellers.reduce((sum, s) => {
      const share = Math.abs(s.netValue) / totalNetSell;
      return sum + share * share;
    }, 0);
  }

  // Buyer price clustering for top 3 buyers
  const topBuyers = buyers.slice(0, 3).filter((b) => b.avgBuyPrice > 0);
  let buyerPriceClusteringPct = 0;
  if (topBuyers.length >= 2) {
    const prices = topBuyers.map((b) => b.avgBuyPrice);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    if (avgPrice > 0) {
      // Percentage spread relative to average buy price
      buyerPriceClusteringPct = (maxPrice - minPrice) / avgPrice;
    }
  }

  const sellerCount = sellers.length;
  // Extreme concentration signature:
  // Top 3 net buyers absorb >= 60% of total net buy, facing >= 15 distinct sellers (or HHI <= 0.15)
  const isExtremeConcentration =
    top3NetValueRatio >= 0.6 &&
    (sellerCount >= 15 || (sellerCount >= 8 && retailDispersionIndex <= 0.2)) &&
    (topBuyers.length < 2 || buyerPriceClusteringPct <= 0.05);

  return {
    top1NetValueRatio: Number(top1NetValueRatio.toFixed(4)),
    top3NetValueRatio: Number(top3NetValueRatio.toFixed(4)),
    retailDispersionIndex: Number(retailDispersionIndex.toFixed(4)),
    sellerCount,
    buyerPriceClusteringPct: Number(buyerPriceClusteringPct.toFixed(4)),
    isExtremeConcentration,
  };
}
