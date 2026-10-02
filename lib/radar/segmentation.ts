import type { BrokerSummaryEntry, BrokerTier, BrokerSegmentationMetrics } from './types';

/**
 * IDX Broker code tier mapping based on primary institutional clearing role.
 *
 * FOREIGN_CUSTODIAN: Global prime brokerages & foreign custodial desks.
 * DOMESTIC_INSTITUTION: Major state-owned and top-tier domestic institutional houses.
 * BOUTIQUE_AFFILIATED: Specialized boutique brokers, group-affiliated desks, IPO underwriters.
 * RETAIL: High-retail-volume brokerages, fintechs, regional retail branches.
 */
const FOREIGN_CUSTODIAN_CODES = new Set([
  'AK', // UBS
  'BK', // J.P. Morgan
  'CG', // Citigroup
  'CS', // Credit Suisse
  'DB', // Deutsche Bank
  'DP', // DBS Vickers
  'FS', // Yuanta
  'GW', // HSBC
  'HD', // KGI
  'KZ', // CLSA
  'MI', // Victoria
  'MS', // Morgan Stanley
  'RX', // Macquarie
  'TP', // OCBC
  'YU', // CGS International
  'ZP', // Maybank
  'BQ', // Korea Investment
]);

const DOMESTIC_INSTITUTION_CODES = new Set([
  'CC', // Mandiri Sekuritas (Institutional arm)
  'OD', // BRI Danareksa Sekuritas
  'NI', // BNI Sekuritas
  'DX', // Bahana Sekuritas
  'LG', // Trimegah Sekuritas
  'SQ', // BCA Sekuritas
  'GR', // Panin Sekuritas
]);

const BOUTIQUE_AFFILIATED_CODES = new Set([
  'AN', 'AO', 'AR', 'AT', 'BR', 'CD', 'DD', 'DH', 'DU', 'EL', 'FO', 'FZ',
  'GA', 'GI', 'HP', 'IC', 'ID', 'IN', 'IT', 'IU', 'KI', 'PC', 'PO', 'PP',
  'PS', 'QA', 'RF', 'RG', 'RO', 'RS', 'SA', 'SF', 'SH', 'SS', 'TS', 'XA',
  'ZR', 'BB', 'BS', 'IF', 'IH', 'II', 'MG', 'PG',
]);

const RETAIL_CODES = new Set([
  'YP', // Mirae Asset Sekuritas
  'PD', // Indo Premier Sekuritas
  'XC', // Ajaib Sekuritas
  'XL', // Stockbit Sekuritas
  'KK', // Phillip Sekuritas
  'CP', // KB Valbury
  'EP', // MNC Sekuritas
  'AZ', // Sucor Sekuritas
  'DR', // RHB Sekuritas
  'AD', 'AF', 'AP', 'BF', 'LS', 'OK', 'PF', 'PI', 'RB', 'TF', 'YB', 'YJ', 'YO',
]);

export function classifyBroker(code: string): BrokerTier {
  const upper = (code || '').toUpperCase().trim();
  if (FOREIGN_CUSTODIAN_CODES.has(upper)) return 'FOREIGN_CUSTODIAN';
  if (DOMESTIC_INSTITUTION_CODES.has(upper)) return 'DOMESTIC_INSTITUTION';
  if (BOUTIQUE_AFFILIATED_CODES.has(upper)) return 'BOUTIQUE_AFFILIATED';
  if (RETAIL_CODES.has(upper)) return 'RETAIL';
  return 'UNKNOWN';
}

export function calculateSegmentation(entries: BrokerSummaryEntry[]): BrokerSegmentationMetrics {
  let foreignNetValue = 0;
  let boutiqueNetValue = 0;
  let domesticInstNetValue = 0;
  let retailNetValue = 0;

  const buyTierTotals: Record<BrokerTier, number> = {
    FOREIGN_CUSTODIAN: 0,
    DOMESTIC_INSTITUTION: 0,
    BOUTIQUE_AFFILIATED: 0,
    RETAIL: 0,
    UNKNOWN: 0,
  };

  const sellTierTotals: Record<BrokerTier, number> = {
    FOREIGN_CUSTODIAN: 0,
    DOMESTIC_INSTITUTION: 0,
    BOUTIQUE_AFFILIATED: 0,
    RETAIL: 0,
    UNKNOWN: 0,
  };

  for (const entry of entries) {
    const tier = classifyBroker(entry.brokerCode);
    const net = entry.netValue;

    if (tier === 'FOREIGN_CUSTODIAN') foreignNetValue += net;
    else if (tier === 'BOUTIQUE_AFFILIATED') boutiqueNetValue += net;
    else if (tier === 'DOMESTIC_INSTITUTION') domesticInstNetValue += net;
    else if (tier === 'RETAIL') retailNetValue += net;

    if (net > 0) {
      buyTierTotals[tier] += net;
    } else if (net < 0) {
      sellTierTotals[tier] += Math.abs(net);
    }
  }

  // Combined institutional positive net buy
  const institutionalNetValue = foreignNetValue + boutiqueNetValue + domesticInstNetValue;

  let institutionToRetailAbsorptionRatio = 0;
  if (retailNetValue < 0) {
    const retailNetSell = Math.abs(retailNetValue);
    if (retailNetSell > 0) {
      institutionToRetailAbsorptionRatio = Math.max(0, institutionalNetValue / retailNetSell);
    }
  }

  // Find predominant buyer tier
  let predominantBuyerTier: BrokerTier = 'UNKNOWN';
  let maxBuy = 0;
  for (const [t, total] of Object.entries(buyTierTotals) as [BrokerTier, number][]) {
    if (total > maxBuy) {
      maxBuy = total;
      predominantBuyerTier = t;
    }
  }

  // Find predominant seller tier
  let predominantSellerTier: BrokerTier = 'UNKNOWN';
  let maxSell = 0;
  for (const [t, total] of Object.entries(sellTierTotals) as [BrokerTier, number][]) {
    if (total > maxSell) {
      maxSell = total;
      predominantSellerTier = t;
    }
  }

  // Clear institutional absorption signature:
  // Institutions/foreign are net positive while retail is net negative with absorption >= 1.0
  const isInstitutionalAbsorption =
    institutionalNetValue > 0 &&
    retailNetValue < 0 &&
    institutionToRetailAbsorptionRatio >= 1.0;

  return {
    foreignNetValue: Number(foreignNetValue.toFixed(2)),
    boutiqueNetValue: Number(boutiqueNetValue.toFixed(2)),
    domesticInstNetValue: Number(domesticInstNetValue.toFixed(2)),
    retailNetValue: Number(retailNetValue.toFixed(2)),
    institutionToRetailAbsorptionRatio: Number(institutionToRetailAbsorptionRatio.toFixed(4)),
    predominantBuyerTier,
    predominantSellerTier,
    isInstitutionalAbsorption,
  };
}
