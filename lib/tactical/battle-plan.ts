import { jakartaYmd, isWeekend, isIdxHoliday } from '../market-calendar';

export interface BattlePlanCandidate {
  emiten: string;
  stance: string;
  entryPrice: number;
  targetR1: number;
  targetMax: number;
  invalidationStop: number;
  avgDailyVolume20d: number;
  macroBias?: string;
  catalystSummary?: string;
}

export interface BattlePlanRow {
  planDate: string;
  emiten: string;
  stance: string;
  triggerPrice: number;
  targetR1: number;
  targetMax: number;
  invalidationPrice: number;
  open15mVolThreshold: number;
  macroBias: string;
  catalystSummary?: string;
}

/**
 * Checks if the given instant corresponds to an active trading day in Jakarta.
 */
export function isTradingDayJakarta(now: Date): boolean {
  const ymd = jakartaYmd(now);
  if (isWeekend(ymd) || isIdxHoliday(ymd)) {
    return false;
  }
  return true;
}

/**
 * Builds a deterministic Pre-Market Battle Plan row for a single candidate.
 * Implements the V_15m 15-minute volume confirmation threshold (15% of 20d volume).
 * Fails closed (returns null) if mandatory pricing levels are missing or invalid.
 */
export function buildBattlePlanRow(
  candidate: BattlePlanCandidate,
  planDate: string
): BattlePlanRow | null {
  const {
    emiten,
    stance,
    entryPrice,
    targetR1,
    targetMax,
    invalidationStop,
    avgDailyVolume20d,
    macroBias = 'NEUTRAL',
    catalystSummary,
  } = candidate;

  if (
    !emiten ||
    !stance ||
    typeof entryPrice !== 'number' ||
    entryPrice <= 0 ||
    typeof targetR1 !== 'number' ||
    targetR1 <= 0 ||
    typeof targetMax !== 'number' ||
    targetMax <= 0 ||
    typeof invalidationStop !== 'number' ||
    invalidationStop <= 0
  ) {
    return null;
  }

  // 15-Minute Volume Confirmation Threshold: 15% of 20-day Average Daily Volume
  const safeAvgVol = typeof avgDailyVolume20d === 'number' && avgDailyVolume20d > 0
    ? avgDailyVolume20d
    : 0;
  const open15mVolThreshold = Math.round(0.15 * safeAvgVol);

  return {
    planDate,
    emiten: emiten.toUpperCase(),
    stance,
    triggerPrice: entryPrice,
    targetR1,
    targetMax,
    invalidationPrice: invalidationStop,
    open15mVolThreshold,
    macroBias,
    catalystSummary,
  };
}
