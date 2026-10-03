import { BrokerClassification } from './types';

const BROKER_REGISTRY: Record<string, { name: string; archetype: BrokerClassification['archetype']; isWhale: boolean }> = {
  // Foreign Institutional (Whales)
  AK: { name: 'UBS Sekuritas Indonesia', archetype: 'foreign_institutional', isWhale: true },
  BK: { name: 'J.P. Morgan Sekuritas Indonesia', archetype: 'foreign_institutional', isWhale: true },
  CC: { name: 'Mandiri Sekuritas', archetype: 'foreign_institutional', isWhale: true },
  CS: { name: 'Credit Suisse Sekuritas Indonesia', archetype: 'foreign_institutional', isWhale: true },
  RX: { name: 'Macquarie Sekuritas Indonesia', archetype: 'foreign_institutional', isWhale: true },
  KZ: { name: 'CLSA Sekuritas Indonesia', archetype: 'foreign_institutional', isWhale: true },
  ZP: { name: 'Maybank Sekuritas Indonesia', archetype: 'foreign_institutional', isWhale: true },
  CG: { name: 'CGS-CIMB Sekuritas Indonesia', archetype: 'foreign_institutional', isWhale: true },

  // Domestic Institutional
  OD: { name: 'BRI Danareksa Sekuritas', archetype: 'domestic_institutional', isWhale: false },
  LG: { name: 'Trimegah Sekuritas Indonesia', archetype: 'domestic_institutional', isWhale: false },
  NI: { name: 'BNI Sekuritas', archetype: 'domestic_institutional', isWhale: false },
  DP: { name: 'DBS Vickers Sekuritas Indonesia', archetype: 'domestic_institutional', isWhale: false },
  DX: { name: 'Bahana Sekuritas', archetype: 'domestic_institutional', isWhale: false },
  TP: { name: 'OCBC Sekuritas Indonesia', archetype: 'domestic_institutional', isWhale: false },

  // Retail Archetypes
  YP: { name: 'Mirae Asset Sekuritas Indonesia', archetype: 'retail', isWhale: false },
  PD: { name: 'Indo Premier Sekuritas', archetype: 'retail', isWhale: false },
  XC: { name: 'Ajaib Sekuritas Asia', archetype: 'retail', isWhale: false },
  KK: { name: 'Phillip Sekuritas Indonesia', archetype: 'retail', isWhale: false },
  CP: { name: 'KB Valbury Sekuritas', archetype: 'retail', isWhale: false },
  SQ: { name: 'BCA Sekuritas', archetype: 'retail', isWhale: false },
  XL: { name: 'Stockbit Sekuritas Digital', archetype: 'retail', isWhale: false },
};

/**
 * Classify a 2-letter IDX broker code into its institutional archetype and whale status.
 */
export function classifyBrokerArchetype(code: string): BrokerClassification {
  const normalized = (code || '').trim().toUpperCase();
  const entry = BROKER_REGISTRY[normalized];

  if (!entry) {
    return {
      code: normalized,
      name: 'Unclassified Broker',
      archetype: 'unclassified',
      isWhale: false,
    };
  }

  return {
    code: normalized,
    name: entry.name,
    archetype: entry.archetype,
    isWhale: entry.isWhale,
  };
}
