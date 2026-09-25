/**
 * Canonical hit predicates for the Adi target engine.
 *
 * A hit is ONLY a next-day high touching or exceeding the target. `real_harga`
 * (close) must never count toward a hit — otherwise a stock that opens above
 * target and dumps still reads as "hit". NaN/Infinity never count.
 */

interface HitRow {
  max_harga?: number | null;
  real_harga?: number | null;
  target_realistis?: number | null;
  target_max?: number | null;
}

export function hitR1(row: HitRow): boolean {
  return touchTarget(row.max_harga, row.target_realistis);
}

export function hitMax(row: HitRow): boolean {
  return touchTarget(row.max_harga, row.target_max);
}

function touchTarget(max: number | null | undefined, target: number | null | undefined): boolean {
  const maxNum = Number(max);
  const targetNum = Number(target);
  return Number.isFinite(maxNum) && Number.isFinite(targetNum) && maxNum >= targetNum;
}
