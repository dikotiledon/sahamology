import { RightsIssueMetrics } from './types';

export interface RightsAnalyzerInput {
  currentPrice: number;
  cumDate?: string | null;
  exDate?: string | null;
  rightsRatio?: string | null; // e.g. "100:35" -> 100 old shares get 35 new rights
  exercisePrice?: number | null;
  standbyBuyer?: string | null;
}

/**
 * Parses a ratio string like "100:35" or "10:3" into [oldShares, newShares].
 */
export function parseRightsRatio(ratioStr?: string | null): [number, number] | null {
  if (!ratioStr) return null;
  const parts = ratioStr.split(':').map((s) => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] > 0 && parts[1] > 0) {
    return [parts[0], parts[1]];
  }
  return null;
}

/**
 * Calculates Theoretical Ex-Rights Price (Harga Teoritis), Dilution Percentage,
 * and Exercise Price Discount for Rights Issues (HMETD).
 */
export function calculateRightsIssueMetrics(input: RightsAnalyzerInput): RightsIssueMetrics | null {
  const {
    currentPrice,
    cumDate = null,
    exDate = null,
    rightsRatio = null,
    exercisePrice = null,
    standbyBuyer = null,
  } = input;

  if (!rightsRatio || exercisePrice == null || exercisePrice <= 0 || currentPrice <= 0) {
    return null;
  }

  const ratio = parseRightsRatio(rightsRatio);
  if (!ratio) return null;

  const [oldShares, newShares] = ratio;

  // Theoretical Ex-Rights Price = ((oldShares * currentPrice) + (newShares * exercisePrice)) / (oldShares + newShares)
  const theoreticalPrice = Number(
    (
      (oldShares * currentPrice + newShares * exercisePrice) /
      (oldShares + newShares)
    ).toFixed(2)
  );

  // Dilution % = newShares / (oldShares + newShares) * 100
  const dilutionPct = Number(((newShares / (oldShares + newShares)) * 100).toFixed(2));

  // Exercise Discount % = (currentPrice - exercisePrice) / currentPrice * 100
  const discountPct = Number((((currentPrice - exercisePrice) / currentPrice) * 100).toFixed(2));

  const hasStandbyBuyer = Boolean(standbyBuyer && standbyBuyer.trim().length > 0);

  return {
    cumDate,
    exDate,
    rightsRatio,
    exercisePrice,
    theoreticalPrice,
    dilutionPct,
    discountPct,
    standbyBuyer: standbyBuyer?.trim() || null,
    hasStandbyBuyer,
  };
}
