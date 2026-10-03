import type { ContractionDetectionResult } from './contraction-detector';
import type { TrendTemplateResult } from './types';

export interface VcpConfluenceInput {
  vcp: ContractionDetectionResult;
  trend: TrendTemplateResult;
  aqsScore?: number;
  wyckoffPhase?: string;
  pocPrice?: number;
  sectorQuadrant?: string;
}

export interface VcpConfluenceResult {
  confluenceTag: string;
  confluenceScore: number;
  isHighQualitySetup: boolean;
  advisory: string;
}

/**
 * Evaluates execution confluence between VCP contraction stage,
 * Minervini Stage 2 Trend Template, Brosum AQS, and Wyckoff phase.
 */
export function evaluateVcpConfluence(input: VcpConfluenceInput): VcpConfluenceResult {
  const { vcp, trend, aqsScore, wyckoffPhase, sectorQuadrant } = input;

  let baseScore = 50;

  // Trend template contribution
  if (trend.passed) {
    baseScore += 20;
  } else if (trend.priceAboveSma50 && trend.sma200TrendingUp) {
    baseScore += 10;
  }

  // Contraction stage contribution
  if (vcp.stage === 'PIVOT_READY') {
    baseScore += 20;
  } else if (vcp.stage === 'BREAKOUT_CONFIRMED') {
    baseScore += 15;
  } else if (vcp.stage === 'FAILED') {
    baseScore -= 30;
  }

  // Volume dry-up bonus
  if (vcp.isVolumeDriedUp) {
    baseScore += 10;
  }

  // Institutional Brosum AQS confluence
  const hasStrongBrosum = (aqsScore ?? 0) >= 65;
  if (hasStrongBrosum) {
    baseScore += 15;
  }

  // Wyckoff phase confluence (Phase D or Phase E markup)
  const isWyckoffMarkup = wyckoffPhase === 'PHASE_D_MARKUP_RANGE' || wyckoffPhase === 'PHASE_E_MARKUP';
  if (isWyckoffMarkup) {
    baseScore += 10;
  }

  // Sector tailwind confluence
  const hasSectorTailwind = sectorQuadrant === 'LEADING' || sectorQuadrant === 'IMPROVING';
  if (hasSectorTailwind) {
    baseScore += 5;
  }

  const confluenceScore = Math.max(0, Math.min(100, baseScore));

  let confluenceTag: string;
  let isHighQualitySetup = false;
  let advisory: string;

  if (vcp.stage === 'FAILED') {
    confluenceTag = 'VCP_FAILED_BREAKDOWN';
    advisory = '⚠️ Struktur VCP gagal. Harga telah menembus stop loss dasar kontraksi.';
  } else if (vcp.stage === 'PIVOT_READY' && trend.passed && hasStrongBrosum) {
    confluenceTag = 'PRIME_ACCUMULATION_VCP';
    isHighQualitySetup = true;
    advisory = '🔥 PRIME SETUP: VCP siap breakout dengan Stage 2 Trend Template & akumulasi Brosum whale (AQS >= 65).';
  } else if (vcp.stage === 'PIVOT_READY' && trend.passed) {
    confluenceTag = 'VCP_PIVOT_STAGE2_ALIGNED';
    isHighQualitySetup = true;
    advisory = '🎯 VCP PIVOT READY: Volatilitas mengering di dalam Stage 2 uptrend. Pantau volume konfirmasi saat tembus pivot.';
  } else if (vcp.stage === 'BREAKOUT_CONFIRMED') {
    confluenceTag = 'VCP_BREAKOUT_ACTIVE';
    isHighQualitySetup = true;
    advisory = '🚀 VCP BREAKOUT AKTIF: Harga telah menembus level pivot dengan dukungan volume.';
  } else if (trend.passed && vcp.stage === 'DEVELOPING') {
    confluenceTag = 'VCP_DEVELOPING_STAGE2';
    advisory = '⏳ Base VCP sedang terbentuk dalam tren Stage 2 yang sehat. Tunggu kontraksi menyempit.';
  } else {
    confluenceTag = 'VCP_LOW_CONFLUENCE';
    advisory = 'Struktur VCP belum lengkap atau belum terkonfirmasi oleh Trend Template.';
  }

  return {
    confluenceTag,
    confluenceScore,
    isHighQualitySetup,
    advisory,
  };
}
