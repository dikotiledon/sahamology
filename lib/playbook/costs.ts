/**
 * IDX round-trip friction model (documented stand-in).
 *
 * buyFeeRate      0.0015 (0.15% broker buy commission, stand-in)
 * sellFeeRate     0.0025 (0.25% sell bundle: broker + 0.1% PPh final + levy/VAT)
 * spreadHaircutRate 0.001 (0.1% per side adverse-fill haircut)
 *
 * These are conservative stand-ins, not exchange-filed rates. Bump them if the
 * operator's broker contract differs.
 */

export type CostModel = {
  buyFeeRate: number;
  sellFeeRate: number;
  spreadHaircutRate: number;
};

export function defaultCostModel(): CostModel {
  return {
    buyFeeRate: 0.0015,
    sellFeeRate: 0.0025,
    spreadHaircutRate: 0.001,
  };
}

export function roundTripCostRate(c: CostModel): number {
  return c.buyFeeRate + c.sellFeeRate + 2 * c.spreadHaircutRate;
}
