import {
  SmcRegime,
  MarketStructureType,
  BreakOfStructure,
  OrderBlockZone,
  FairValueGapZone,
  LiquiditySweepEvent,
} from './types';

export interface SmcConfluenceInput {
  currentPrice: number;
  marketStructure: MarketStructureType;
  lastBOS?: BreakOfStructure;
  activeBullishOB?: OrderBlockZone;
  activeBullishFVG?: FairValueGapZone;
  lastLiquiditySweep?: LiquiditySweepEvent;
  daysSinceBOS?: number;
  daysSinceSweep?: number;
}

export interface SmcConfluenceOutput {
  regime: SmcRegime;
  score: number;
  advisory: string;
}

/**
 * Evaluates Smart Money Concepts confluence across market structure,
 * order blocks, fair value gaps, and liquidity sweeps.
 */
export function evaluateSmcConfluence(input: SmcConfluenceInput): SmcConfluenceOutput {
  const {
    currentPrice,
    marketStructure,
    lastBOS,
    activeBullishOB,
    activeBullishFVG,
    lastLiquiditySweep,
    daysSinceBOS = 999,
    daysSinceSweep = 999,
  } = input;

  // 1. Prime Order Block Defense
  if (
    activeBullishOB &&
    activeBullishOB.mitigationStatus !== 'INVALIDATED' &&
    currentPrice >= activeBullishOB.bottom * 0.99 &&
    currentPrice <= activeBullishOB.top * 1.02 &&
    marketStructure === 'BULLISH_EXPANSION'
  ) {
    return {
      regime: 'PRIME_ORDER_BLOCK_DEFENSE',
      score: 90,
      advisory: `Harga sedang menguji zona pertahanan Bullish Order Block institusi di Rp ${activeBullishOB.bottom.toLocaleString('id-ID')} - Rp ${activeBullishOB.top.toLocaleString('id-ID')} (Midpoint: Rp ${activeBullishOB.midpoint.toLocaleString('id-ID')}). Area reaksi pantulan asimetris.`,
    };
  }

  // 2. Liquidity Sweep Reversal (recent stop-hunt and reclaim)
  if (
    lastLiquiditySweep &&
    lastLiquiditySweep.type === 'BULLISH_SWEEP' &&
    daysSinceSweep <= 5
  ) {
    return {
      regime: 'LIQUIDITY_SWEEP_REVERSAL',
      score: 80,
      advisory: `Pembersihan likuiditas (Liquidity Sweep) menyapu stop loss di bawah Rp ${lastLiquiditySweep.sweptPrice.toLocaleString('id-ID')} (-${lastLiquiditySweep.sweepDepthPct}%) dan berhasil direklamasi ke Rp ${lastLiquiditySweep.reclaimedPrice.toLocaleString('id-ID')}. Indikasi akumulasi Smart Money.`,
    };
  }

  // 3. BOS Bullish Expansion
  if (
    lastBOS &&
    lastBOS.direction === 'BULLISH' &&
    daysSinceBOS <= 5 &&
    marketStructure === 'BULLISH_EXPANSION'
  ) {
    return {
      regime: 'BOS_BULLISH_EXPANSION',
      score: 85,
      advisory: `Konfirmasi ${lastBOS.type} menembus swing level Rp ${lastBOS.brokenSwingPrice.toLocaleString('id-ID')} dengan volume ${lastBOS.volumeRatio}x rerata 20 sesi. Struktur tren naik aktif.`,
    };
  }

  // 4. FVG Rebalancing Pullback
  if (
    activeBullishFVG &&
    activeBullishFVG.mitigationStatus !== 'INVALIDATED' &&
    currentPrice >= activeBullishFVG.bottom * 0.99 &&
    currentPrice <= activeBullishFVG.top * 1.03
  ) {
    return {
      regime: 'FVG_REBALANCING_PULLBACK',
      score: 70,
      advisory: `Harga melakukan rebalancing ke area Fair Value Gap (FVG) Rp ${activeBullishFVG.bottom.toLocaleString('id-ID')} - Rp ${activeBullishFVG.top.toLocaleString('id-ID')} dengan target Consequent Encroachment (50%) di Rp ${activeBullishFVG.cePrice.toLocaleString('id-ID')}.`,
    };
  }

  // 5. Bearish Structure CHoCH
  if (
    marketStructure === 'BEARISH_CONTRACTION' ||
    (lastBOS && lastBOS.direction === 'BEARISH' && daysSinceBOS <= 5)
  ) {
    return {
      regime: 'BEARISH_STRUCTURE_CHOCH',
      score: 30,
      advisory: `Peringatan perubahan karakter pasar (CHoCH) atau struktur penurunan aktif. Waspadai tekanan distribusi lanjutan.`,
    };
  }

  // 6. Neutral Structure
  return {
    regime: 'NEUTRAL_STRUCTURE',
    score: 50,
    advisory: `Struktur pasar dalam fase konsolidasi/netral. Belum terdeteksi zona pertahanan Order Block atau FVG aktif di dekat harga berjalan.`,
  };
}
