export type BrokerArchetype =
  | 'foreign_institutional'
  | 'domestic_institutional'
  | 'retail'
  | 'proprietary'
  | 'unclassified';

export interface BrokerClassification {
  code: string;
  name: string;
  archetype: BrokerArchetype;
  isWhale: boolean;
}

export type AbsorptionTag =
  | 'HEAVY_ABSORPTION'
  | 'MODERATE_ABSORPTION'
  | 'NEUTRAL'
  | 'DISTRIBUTION'
  | 'CHURNING';

export type DivergenceRegime =
  | 'WHALE_ABSORPTION'
  | 'RETAIL_TRAP'
  | 'SYNCHRONIZED_ACCUMULATION'
  | 'DOMESTIC_DRIVEN'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'NEUTRAL';
