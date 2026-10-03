import { WeeklyMetrics, DailyMetrics, MtfRegime } from './types';

export interface AlignmentResult {
  regime: MtfRegime;
  score: number;
  sizingMultiplier: number;
  advisory: string;
}

/**
 * Synthesizes the Higher Timeframe (Weekly Tide) and Intermediate Timeframe (Daily Wave)
 * into a deterministic Multi-Timeframe Alignment Regime, conviction score, and position sizing multiplier.
 */
export function evaluateAlignmentMatrix(
  weekly: WeeklyMetrics,
  daily: DailyMetrics
): AlignmentResult {
  const { stage: weeklyStage } = weekly;
  const { trendState: dailyTrend } = daily;

  // 1. Perfect Tide Alignment: Weekly Stage 2 Expansion + Daily Bullish Expansion
  if (weeklyStage === 'STAGE_2_EXPANSION' && dailyTrend === 'BULLISH_EXPANSION') {
    return {
      regime: 'PERFECT_TIDE_ALIGNMENT',
      score: 95,
      sizingMultiplier: 1.0,
      advisory:
        'Harmoni tren multi-timeframe sempurna: Weekly Stage 2 Expansion selaras dengan Daily Bullish Expansion. Alokasi posisi penuh (1.0x) diizinkan.',
    };
  }

  // 2. High Probability Pullback: Weekly Stage 2 Expansion + Daily Pullback to Support
  if (weeklyStage === 'STAGE_2_EXPANSION' && dailyTrend === 'PULLBACK_SUPPORT') {
    return {
      regime: 'HIGH_PROBABILITY_PULLBACK',
      score: 85,
      sizingMultiplier: 1.0,
      advisory:
        'Peluang re-entry asimetris: Tren makro mingguan Stage 2 Expansion menyerap koreksi harian ke area support EMA20/SMA50. Rasio risk/reward optimal (1.0x ukuran lot).',
    };
  }

  // 3. Counter Trend Trap Hazard: Weekly Stage 4 Capitulation + Daily Bullish/Pullback
  if (
    weeklyStage === 'STAGE_4_CAPITULATION' &&
    (dailyTrend === 'BULLISH_EXPANSION' || dailyTrend === 'PULLBACK_SUPPORT')
  ) {
    return {
      regime: 'COUNTER_TREND_TRAP_HAZARD',
      score: 35,
      sizingMultiplier: 0.4,
      advisory:
        'Peringatan Bull Trap / Dead-Cat Bounce: Penguatan harian berlawanan arah dengan tren turun makro mingguan (Stage 4 Capitulation). Pangkas ukuran lot ke 40% dan terapkan stop loss ketat.',
    };
  }

  // 4. Secular Liquidation: Weekly Stage 4 Capitulation + Daily Bearish Breakdown
  if (weeklyStage === 'STAGE_4_CAPITULATION' && dailyTrend === 'BEARISH_CONTRACTION') {
    return {
      regime: 'SECULAR_LIQUIDATION',
      score: 15,
      sizingMultiplier: 0.0,
      advisory:
        'Likuidasi struktural: Tren mingguan dan harian keduanya berada dalam fase kapitulasi penuh. Pertahanan modal mutlak (0% alokasi beli).',
    };
  }

  // 5. Range Bound Compression: Weekly Stage 1 Basing or Daily Neutral
  if (weeklyStage === 'STAGE_1_BASING' || dailyTrend === 'NEUTRAL') {
    return {
      regime: 'RANGE_BOUND_COMPRESSION',
      score: 60,
      sizingMultiplier: 0.65,
      advisory:
        'Fase akumulasi basis mingguan (Stage 1 Basing). Tren struktural belum lepas; batasi ukuran lot (65%) hingga konfirmasi breakout terjadi.',
    };
  }

  // 6. Mixed Transition: Stage 3 Distribution or Unaligned Transition
  return {
    regime: 'MIXED_TRANSITION',
    score: 50,
    sizingMultiplier: 0.5,
    advisory:
      'Fase transisi multi-timeframe: Terjadi ketidakselarasan arah antara arus mingguan dan gelombang harian. Kurangi risiko ke 50% alokasi normal.',
  };
}
