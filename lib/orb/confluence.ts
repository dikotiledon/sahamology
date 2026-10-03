import { InitialBalanceLevels, DayType, OrbRegime } from './types';

export interface OrbConfluenceInput {
  currentPrice: number;
  ib15: InitialBalanceLevels;
  dayType: DayType;
  v15mVolume: number;
}

export interface OrbConfluenceResult {
  regime: OrbRegime;
  score: number;
  advisory: string;
}

/**
 * Evaluates the interaction between current price and Initial Balance levels (IB15),
 * determining the tactical ORB regime, conviction score, and Indonesian advisory text.
 */
export function evaluateOrbConfluence(input: OrbConfluenceInput): OrbConfluenceResult {
  const { currentPrice, ib15, dayType } = input;

  if (ib15.range <= 0 || currentPrice <= 0) {
    return {
      regime: 'NEUTRAL_IB',
      score: 50,
      advisory: 'Data Initial Balance belum terbentuk atau rentang harga pembukaan flat.',
    };
  }

  // 1. False Breakout Trap
  if (dayType === 'FAILED_BREAKOUT_TRAP') {
    return {
      regime: 'ORB_FALSE_BREAKOUT_TRAP',
      score: 30,
      advisory: `Peringatan False Breakout Trap: Upaya breakout menembus batas Initial Balance gagal bertahan dan harga berbalik ke bawah midpoint Rp ${ib15.midpoint.toLocaleString('id-ID')}. Waspadai tekanan jual responsif institusi.`,
    };
  }

  // 2. Bullish ORB Expansion in strong trend
  if (currentPrice > ib15.high * 1.01 || (dayType === 'TREND_DAY_EXPANSION' && currentPrice > ib15.high)) {
    return {
      regime: 'ORB_BULLISH_EXPANSION',
      score: 90,
      advisory: `Konfirmasi Opening Range Breakout (ORB): Harga berekspansi di atas IB15 High Rp ${ib15.high.toLocaleString('id-ID')}. Target ekstensi likuiditas: R1 Rp ${ib15.extensionR1.toLocaleString('id-ID')}, R2 Rp ${ib15.extensionR2.toLocaleString('id-ID')}.`,
    };
  }

  // 3. Pullback Retest of IB High as Support
  const isRetestingHigh =
    currentPrice >= ib15.high * 0.995 && currentPrice <= ib15.high * 1.01;
  if (isRetestingHigh) {
    return {
      regime: 'ORB_PULLBACK_RETEST',
      score: 85,
      advisory: `Retest sehat pasca-breakout: Harga sedang menguji batas atas Initial Balance Rp ${ib15.high.toLocaleString('id-ID')} sebagai support baru. Area entri pantulan optimal dengan rasio risk/reward terukur.`,
    };
  }

  // 4. Moderate expansion above IB High
  if (currentPrice > ib15.high) {
    return {
      regime: 'ORB_BULLISH_EXPANSION',
      score: 90,
      advisory: `Konfirmasi Opening Range Breakout (ORB): Harga berekspansi di atas IB15 High Rp ${ib15.high.toLocaleString('id-ID')}. Target ekstensi likuiditas: R1 Rp ${ib15.extensionR1.toLocaleString('id-ID')}, R2 Rp ${ib15.extensionR2.toLocaleString('id-ID')}.`,
    };
  }

  // 4. Bearish Breakdown below IB Low
  if (currentPrice < ib15.low) {
    return {
      regime: 'ORB_BEARISH_BREAKDOWN',
      score: 20,
      advisory: `Breakdown batas bawah Initial Balance: Harga menembus di bawah IB15 Low Rp ${ib15.low.toLocaleString('id-ID')}. Target ekstensi penurunan: S1 Rp ${ib15.extensionS1.toLocaleString('id-ID')}, S2 Rp ${ib15.extensionS2.toLocaleString('id-ID')}.`,
    };
  }

  // 5. Inside IB Coiling / Consolidation
  return {
    regime: 'INSIDE_IB_COILING',
    score: 60,
    advisory: `Konsolidasi di dalam Initial Balance (IB15): Harga berotasi di antara Rp ${ib15.low.toLocaleString('id-ID')} - Rp ${ib15.high.toLocaleString('id-ID')} (Midpoint: Rp ${ib15.midpoint.toLocaleString('id-ID')}). Tunggu konfirmasi breakout terarah.`,
  };
}
