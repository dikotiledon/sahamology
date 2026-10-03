'use client';

import React, { useState } from 'react';
import type {
  SectorRotationMetric,
  SectorQuadrant,
} from '@/lib/sector';
import { evaluateSectorConfluence } from '@/lib/sector';

export interface SectorRotationMatrixCardProps {
  sectors?: SectorRotationMetric[];
  selectedSector?: string;
  onSelectSector?: (sector: string) => void;
  asOfDate?: string;
}

const DEFAULT_SECTORS: SectorRotationMetric[] = [
  {
    sector: 'Financials',
    asOfDate: '2026-10-03',
    rsRatio: 104.5,
    rsMomentum: 102.3,
    netFlow5d: 320_000_000_000,
    netFlow20d: 950_000_000_000,
    flowIntensityPct: 15.2,
    quadrant: 'LEADING',
    constituentCount: 4,
    topEmiten: 'BBRI',
  },
  {
    sector: 'Energy',
    asOfDate: '2026-10-03',
    rsRatio: 98.4,
    rsMomentum: 103.1,
    netFlow5d: 145_000_000_000,
    netFlow20d: 280_000_000_000,
    flowIntensityPct: 8.7,
    quadrant: 'IMPROVING',
    constituentCount: 6,
    topEmiten: 'ADRO',
  },
  {
    sector: 'Infrastructure',
    asOfDate: '2026-10-03',
    rsRatio: 101.8,
    rsMomentum: 101.2,
    netFlow5d: 85_000_000_000,
    netFlow20d: 190_000_000_000,
    flowIntensityPct: 6.4,
    quadrant: 'LEADING',
    constituentCount: 5,
    topEmiten: 'TLKM',
  },
  {
    sector: 'Basic Materials',
    asOfDate: '2026-10-03',
    rsRatio: 102.1,
    rsMomentum: 97.5,
    netFlow5d: -45_000_000_000,
    netFlow20d: 110_000_000_000,
    flowIntensityPct: -3.2,
    quadrant: 'WEAKENING',
    constituentCount: 5,
    topEmiten: 'MDKA',
  },
  {
    sector: 'Industrials',
    asOfDate: '2026-10-03',
    rsRatio: 97.6,
    rsMomentum: 101.8,
    netFlow5d: 65_000_000_000,
    netFlow20d: 40_000_000_000,
    flowIntensityPct: 4.8,
    quadrant: 'IMPROVING',
    constituentCount: 4,
    topEmiten: 'ASII',
  },
  {
    sector: 'Consumer Non-Cyclical',
    asOfDate: '2026-10-03',
    rsRatio: 95.8,
    rsMomentum: 94.2,
    netFlow5d: -95_000_000_000,
    netFlow20d: -240_000_000_000,
    flowIntensityPct: -7.5,
    quadrant: 'LAGGING',
    constituentCount: 6,
    topEmiten: 'ICBP',
  },
];

export function SectorRotationMatrixCard({
  sectors = DEFAULT_SECTORS,
  selectedSector: propSelectedSector,
  onSelectSector,
  asOfDate,
}: SectorRotationMatrixCardProps) {
  const [selectedSector, setSelectedSector] = useState<string>(
    propSelectedSector || sectors[0]?.sector || 'Financials'
  );
  const [activeTab, setActiveTab] = useState<'ALL' | SectorQuadrant>('ALL');

  const filteredSectors =
    activeTab === 'ALL'
      ? sectors
      : sectors.filter((s) => s.quadrant === activeTab);

  const currentSectorMetric = sectors.find(
    (s) => s.sector.toLowerCase() === selectedSector.toLowerCase()
  ) || sectors[0];

  const confluence = currentSectorMetric
    ? evaluateSectorConfluence(currentSectorMetric)
    : null;

  function handleSectorClick(sectorName: string) {
    setSelectedSector(sectorName);
    if (onSelectSector) {
      onSelectSector(sectorName);
    }
  }

  function getBadgeClass(quadrant: SectorQuadrant): string {
    switch (quadrant) {
      case 'LEADING':
        return 'sec-badge--leading';
      case 'IMPROVING':
        return 'sec-badge--improving';
      case 'WEAKENING':
        return 'sec-badge--weakening';
      case 'LAGGING':
        return 'sec-badge--lagging';
      default:
        return 'sec-badge--leading';
    }
  }

  return (
    <div className="sec-card">
      <div className="sec-header">
        <div>
          <div className="sec-title-row">
            <h4 className="sec-title">Rotasi Modal Sektoral &amp; Matriks Momentum Arus Institusi</h4>
            {confluence && (
              <span className={`sec-badge ${getBadgeClass(confluence.quadrant)}`}>
                {confluence.quadrant}
              </span>
            )}
          </div>
          <p className="sec-subtitle">
            Relative Strength (RS vs IHSG) &amp; Kecepatan Akumulasi Asing multi-sesi (5d/20d).
            {asOfDate ? ` Sesi: ${asOfDate}` : ''}
          </p>
        </div>
      </div>

      {/* Quadrant Filtering Tabs */}
      <div className="sec-quadrant-tabs">
        {(['ALL', 'LEADING', 'IMPROVING', 'WEAKENING', 'LAGGING'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`sec-quadrant-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'ALL' ? 'Semua Sektor' : tab}
          </button>
        ))}
      </div>

      {/* Selected Sector Confluence Tactical Banner */}
      {confluence && (
        <div
          className={`sec-confluence-banner ${
            confluence.isTailwind
              ? 'sec-confluence-banner--tailwind'
              : confluence.isHeadwind
                ? 'sec-confluence-banner--headwind'
                : 'sec-confluence-banner--neutral'
          }`}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.2rem' }}>
            {confluence.isTailwind
              ? '🌊 SECTOR TAILWIND DETECTED'
              : confluence.isHeadwind
                ? '⚠️ SECTOR HEADWIND WARNING'
                : 'SECTOR ROTATION NEUTRAL'}
          </div>
          <div>{confluence.summary}</div>
        </div>
      )}

      {/* Sector Grid */}
      <div className="sec-grid">
        {filteredSectors.map((s) => {
          const isSelected = s.sector.toLowerCase() === selectedSector.toLowerCase();
          const flowBillions5d = (s.netFlow5d / 1_000_000_000).toFixed(1);
          const flowBillions20d = (s.netFlow20d / 1_000_000_000).toFixed(1);

          return (
            <div
              key={s.sector}
              className={`sec-item ${isSelected ? 'selected' : ''}`}
              onClick={() => handleSectorClick(s.sector)}
            >
              <div className="sec-item-header">
                <span className="sec-name">{s.sector}</span>
                <span className={`sec-badge ${getBadgeClass(s.quadrant)}`}>
                  {s.quadrant}
                </span>
              </div>

              <div className="sec-metrics-row">
                <div className="sec-metric-cell">
                  <span>RS vs IHSG</span>
                  <strong>{s.rsRatio.toFixed(1)}</strong>
                </div>
                <div className="sec-metric-cell">
                  <span>Momentum 5d</span>
                  <strong>{s.rsMomentum.toFixed(1)}</strong>
                </div>
                <div className="sec-metric-cell">
                  <span>Flow 5d</span>
                  <strong style={{ color: s.netFlow5d >= 0 ? '#38ef7d' : '#f43f5e' }}>
                    {s.netFlow5d >= 0 ? `+Rp ${flowBillions5d}B` : `-Rp ${Math.abs(Number(flowBillions5d))}B`}
                  </strong>
                </div>
              </div>

              <div className="sec-metrics-row" style={{ marginTop: '0.2rem' }}>
                <div className="sec-metric-cell">
                  <span>Flow 20d</span>
                  <strong style={{ color: s.netFlow20d >= 0 ? '#38ef7d' : '#f43f5e' }}>
                    {s.netFlow20d >= 0 ? `+Rp ${flowBillions20d}B` : `-Rp ${Math.abs(Number(flowBillions20d))}B`}
                  </strong>
                </div>
                <div className="sec-metric-cell">
                  <span>Intensitas Flow</span>
                  <strong>{s.flowIntensityPct.toFixed(1)}%</strong>
                </div>
                <div className="sec-metric-cell">
                  <span>Top Emiten</span>
                  <strong style={{ color: 'var(--accent-primary, #6366f1)' }}>
                    {s.topEmiten || '—'}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sec-boundary-notice">
        <span>
          🛡️ Mandat Arsitektur: Matriks Rotasi Sektoral adalah filter penemuan &amp; konfluensi arah
          modal institusi; tidak mengubah evaluasi gerbang <strong>G0–G4</strong>. Sinyal beli tetap wajib
          lulus Playbook Trading Desk secara kuantitatif.
        </span>
      </div>
    </div>
  );
}
