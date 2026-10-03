export interface SizerInput {
  accountEquity: number;
  riskPercentage: number;
  plannedEntry: number;
  invalidationStop: number;
  buyFeePct?: number;
  sellFeePct?: number;
  maxCapitalPct?: number;
}

export interface SizerResult {
  recommendedLots: number;
  allocatedCapital: number;
  totalRiskAtStop: number;
  capitalCapReached: boolean;
  isValid: boolean;
  riskPerShare: number;
  maxAllowedLots: number;
}

/**
 * Returns the official IDX price tick (fraksi harga) size based on price bracket:
 *  < 200        : 1
 *  200 .. 499   : 2
 *  500 .. 1999  : 5
 *  2000 .. 4999 : 10
 *  >= 5000      : 25
 */
export function getIdxTickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

/**
 * Calculates deterministic position lot sizing based on account equity,
 * risk tolerance %, stop-loss distance, IDX brokerage friction, and portfolio exposure cap.
 * 1 Lot = 100 shares.
 */
export function calculatePositionSize(input: SizerInput): SizerResult {
  const {
    accountEquity,
    riskPercentage,
    plannedEntry,
    invalidationStop,
    buyFeePct = 0.15,
    sellFeePct = 0.25,
    maxCapitalPct = 20.0,
  } = input;

  // Validation: positive equity, positive prices, stop must be strictly below entry for long setups
  if (
    accountEquity <= 0 ||
    riskPercentage <= 0 ||
    plannedEntry <= 0 ||
    invalidationStop <= 0 ||
    invalidationStop >= plannedEntry
  ) {
    return {
      recommendedLots: 0,
      allocatedCapital: 0,
      totalRiskAtStop: 0,
      capitalCapReached: false,
      isValid: false,
      riskPerShare: 0,
      maxAllowedLots: 0,
    };
  }

  // Friction accounting: entry fee + stop exit fee
  const buyFriction = plannedEntry * (buyFeePct / 100);
  const sellFriction = invalidationStop * (sellFeePct / 100);
  const riskPerShare = (plannedEntry - invalidationStop) + buyFriction + sellFriction;

  // Maximum allowed currency risk
  const maxRiskAmount = accountEquity * (riskPercentage / 100);

  // Maximum risk-based lots: floor(riskAmount / (riskPerShare * 100))
  const riskBasedLots = Math.floor(maxRiskAmount / (riskPerShare * 100));

  // Max capital limit (e.g. 20% of total account capital)
  const maxCapitalAllocation = accountEquity * (maxCapitalPct / 100);
  const maxCapitalLots = Math.floor(maxCapitalAllocation / (plannedEntry * 100));

  const capitalCapReached = riskBasedLots > maxCapitalLots;
  const recommendedLots = Math.min(riskBasedLots, maxCapitalLots);

  const allocatedCapital = recommendedLots * 100 * plannedEntry;
  const totalRiskAtStop = Math.round(recommendedLots * 100 * riskPerShare);

  return {
    recommendedLots,
    allocatedCapital,
    totalRiskAtStop,
    capitalCapReached,
    isValid: true,
    riskPerShare: Math.round(riskPerShare * 100) / 100,
    maxAllowedLots: maxCapitalLots,
  };
}
