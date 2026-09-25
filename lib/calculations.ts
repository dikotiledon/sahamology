/**
 * Calculate Fraksi based on stock price
 * Rules:
 * - < 200: Fraksi 1
 * - 200-499: Fraksi 2
 * - 500-1999: Fraksi 5
 * - 2000-4999: Fraksi 10
 * - >= 5000: Fraksi 25
 */
export function getFraksi(harga: number): number {
  if (harga < 200) return 1;
  if (harga >= 200 && harga < 500) return 2;
  if (harga >= 500 && harga < 2000) return 5;
  if (harga >= 2000 && harga < 5000) return 10;
  return 25; // harga >= 5000
}

export type CalculateTargetsOk = {
  ok: true;
  fraksi: number;
  totalPapan: number;
  rataRataBidOfer: number;
  a: number;
  p: number;
  targetRealistis1: number;
  targetMax: number;
};

export type CalculateTargetsErr = {
  ok: false;
  reason: 'degenerate_book';
};

export type CalculateTargetsResult = CalculateTargetsOk | CalculateTargetsErr;

/**
 * Calculate target prices based on broker and market data.
 *
 * A degenerate book (ARA == ARB, zero total bid+offer, or anything that
 * produces a non-positive totalPapan or rataRataBidOfer) yields
 * `{ ok: false, reason: 'degenerate_book' }` instead of NaN/Infinity targets.
 */
export function calculateTargets(
  rataRataBandar: number,
  barangBandar: number,
  ara: number,
  arb: number,
  totalBid: number,
  totalOffer: number,
  harga: number
): CalculateTargetsResult {
  // Calculate Fraksi
  const fraksi = getFraksi(harga);

  // Total Papan = (ARA - ARB) / Fraksi
  const totalPapan = (ara - arb) / fraksi;

  // Rata rata Bid Ofer = (Total Bid + Total Offer) / Total Papan
  const rataRataBidOfer = (totalBid + totalOffer) / totalPapan;

  if (
    !Number.isFinite(totalPapan) ||
    !Number.isFinite(rataRataBidOfer) ||
    !(totalPapan > 0) ||
    !(rataRataBidOfer > 0)
  ) {
    return { ok: false, reason: 'degenerate_book' };
  }

  // a = Rata rata bandar × 5%
  const a = rataRataBandar * 0.05;

  // p = Barang Bandar / Rata rata Bid Ofer
  const p = barangBandar / rataRataBidOfer;

  // Target Realistis = Rata rata bandar + a + (p/2 × Fraksi)
  const targetRealistis1 = rataRataBandar + a + ((p / 2) * fraksi);

  // Target Max = Rata rata bandar + a + (p × Fraksi)
  const targetMax = rataRataBandar + a + (p * fraksi);

  return {
    ok: true,
    fraksi,
    totalPapan: Math.round(totalPapan),
    rataRataBidOfer: Math.round(rataRataBidOfer),
    a: Math.round(a),
    p: Math.round(p),
    targetRealistis1: Math.round(targetRealistis1),
    targetMax: Math.round(targetMax),
  };
}
