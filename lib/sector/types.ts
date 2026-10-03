export type SectorQuadrant =
  | 'LEADING'
  | 'WEAKENING'
  | 'LAGGING'
  | 'IMPROVING'
  | 'SECTOR_NEUTRAL';

export interface SectorConstituentBar {
  emiten: string;
  date: string;
  close: number;
  volume: number;
  turnover: number;
  netInstitutionalBuy: number; // in IDR (foreign + institutional broker net)
}

export interface SectorTimeSeriesInput {
  sector: string;
  asOfDate: string;
  constituentBars: SectorConstituentBar[];
  ihsgBars: Array<{ date: string; close: number }>;
}

export interface SectorRotationMetric {
  sector: string;
  asOfDate: string;
  rsRatio: number; // 20-day relative strength vs IHSG, normalized around 100
  rsMomentum: number; // 5-day relative strength momentum vs IHSG, normalized around 100
  netFlow5d: number; // 5-day net institutional flow in IDR
  netFlow20d: number; // 20-day net institutional flow in IDR
  flowIntensityPct: number; // (netFlow5d / turnover5d) * 100
  quadrant: SectorQuadrant;
  constituentCount: number;
  topEmiten?: string;
}

export interface SectorRotationConfluence {
  sector: string;
  quadrant: SectorQuadrant;
  isTailwind: boolean;
  isHeadwind: boolean;
  summary: string;
}
