/**
 * Relative Strength vs IHSG and Sector Flow Aggregation.
 * Display-only auxiliary analysis surfaces for the Insider Radar.
 * Spec: .omh/plans/2026-10-02-trading-capability-brief.md §3
 */

import type { RadarAssessment, RelativeStrengthMetrics, SectorFlowSummary } from './types';

export interface PriceCloseBar {
  close: number;
}

/**
 * Calculates 20-day relative strength of an emiten against the benchmark IHSG index.
 * RS Ratio > 1.0 indicates outperformance against the broader Indonesian equity market.
 * Returns null if either series has fewer than 21 usable bars or degenerate prices.
 */
export function calculateRelativeStrength(
  emitenBars: PriceCloseBar[],
  ihsgBars: PriceCloseBar[]
): RelativeStrengthMetrics | null {
  if (!Array.isArray(emitenBars) || !Array.isArray(ihsgBars)) return null;
  if (emitenBars.length < 21 || ihsgBars.length < 21) return null;

  const emitenCurrent = emitenBars[emitenBars.length - 1]?.close;
  const emiten20Ago = emitenBars[emitenBars.length - 21]?.close;

  const ihsgCurrent = ihsgBars[ihsgBars.length - 1]?.close;
  const ihsg20Ago = ihsgBars[ihsgBars.length - 21]?.close;

  if (
    !Number.isFinite(emitenCurrent) ||
    !Number.isFinite(emiten20Ago) ||
    !Number.isFinite(ihsgCurrent) ||
    !Number.isFinite(ihsg20Ago) ||
    emitenCurrent <= 0 ||
    emiten20Ago <= 0 ||
    ihsgCurrent <= 0 ||
    ihsg20Ago <= 0
  ) {
    return null;
  }

  const emitenReturn = (emitenCurrent - emiten20Ago) / emiten20Ago;
  const ihsgReturn = (ihsgCurrent - ihsg20Ago) / ihsg20Ago;

  const rsRatio = (emitenCurrent / emiten20Ago) / (ihsgCurrent / ihsg20Ago);

  const emitenReturn20dPct = Math.round(emitenReturn * 10000) / 100;
  const ihsgReturn20dPct = Math.round(ihsgReturn * 10000) / 100;
  const perfSpreadPct = Math.round((emitenReturn20dPct - ihsgReturn20dPct) * 100) / 100;

  return {
    emitenReturn20dPct,
    ihsgReturn20dPct,
    rsRatio: Math.round(rsRatio * 1000) / 1000,
    outperforming: rsRatio >= 1.0,
    perfSpreadPct,
  };
}

/**
 * Aggregates net institutional capital flow and average radar scores grouped by sector.
 * Display-only: does not alter stance recommendations.
 */
export function summarizeSectorFlow(
  assessments: RadarAssessment[]
): SectorFlowSummary[] {
  if (!Array.isArray(assessments) || assessments.length === 0) return [];

  const map = new Map<string, {
    emitenCount: number;
    totalNetInst: number;
    scoreSum: number;
    strongAccum: number;
    heavyDist: number;
  }>();

  for (const item of assessments) {
    const sector = (item.sector || 'Unclassified').trim();
    const entry = map.get(sector) || {
      emitenCount: 0,
      totalNetInst: 0,
      scoreSum: 0,
      strongAccum: 0,
      heavyDist: 0,
    };

    entry.emitenCount += 1;
    // Institutional net flow = foreign + domestic institutional
    const instNet = (item.segmentation.foreignNetValue || 0) + (item.segmentation.domesticInstNetValue || 0);
    entry.totalNetInst += instNet;
    entry.scoreSum += item.score;
    if (item.verdict === 'STRONG_ACCUMULATION') entry.strongAccum += 1;
    if (item.verdict === 'HEAVY_DISTRIBUTION') entry.heavyDist += 1;

    map.set(sector, entry);
  }

  const results: SectorFlowSummary[] = [];
  for (const [sector, data] of map.entries()) {
    results.push({
      sector,
      emitenCount: data.emitenCount,
      totalNetInstitutionalValue: Math.round(data.totalNetInst),
      averageRadarScore: Math.round((data.scoreSum / data.emitenCount) * 10) / 10,
      strongAccumCount: data.strongAccum,
      heavyDistCount: data.heavyDist,
    });
  }

  // Sort by total net institutional flow descending
  results.sort((a, b) => b.totalNetInstitutionalValue - a.totalNetInstitutionalValue);

  return results;
}
