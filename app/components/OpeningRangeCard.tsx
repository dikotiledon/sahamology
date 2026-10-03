'use client';

import React, { useEffect, useState } from 'react';
import type {
  OrbAssessment,
  OrbRegime,
  DayType,
} from '@/lib/orb/types';

export interface OpeningRangeCardProps {
  emiten: string;
  initialData?: OrbAssessment | null;
  className?: string;
}

function getRegimeClass(regime: OrbRegime): string {
  switch (regime) {
    case 'ORB_BULLISH_EXPANSION':
      return 'orb-regime--expansion';
    case 'ORB_PULLBACK_RETEST':
      return 'orb-regime--retest';
    case 'INSIDE_IB_COILING':
      return 'orb-regime--coiling';
    case 'ORB_FALSE_BREAKOUT_TRAP':
      return 'orb-regime--trap';
    case 'ORB_BEARISH_BREAKDOWN':
      return 'orb-regime--breakdown';
    default:
      return 'orb-regime--neutral';
  }
}

function getDayTypeClass(dayType: DayType): string {
  switch (dayType) {
    case 'TREND_DAY_EXPANSION':
      return 'badge-trend-day';
    case 'NORMAL_VARIATION_DAY':
      return 'badge-normal-variation';
    case 'FAILED_BREAKOUT_TRAP':
      return 'badge-trap-day';
    default:
      return 'badge-neutral-day';
  }
}

function formatPrice(val?: number | null): string {
  if (val == null || isNaN(val)) return '-';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

export function OpeningRangeCard({
  emiten,
  initialData,
  className,
}: OpeningRangeCardProps) {
  const [data, setData] = useState<OrbAssessment | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchOrb() {
      setLoading(true);
      try {
        const res = await fetch(`/api/radar/orb?emiten=${encodeURIComponent(emiten)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success' && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.warn(`[OpeningRangeCard] Failed to fetch ORB for ${emiten}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchOrb();
    return () => {
      isMounted = false;
    };
  }, [emiten, initialData]);

  if (loading) {
    return (
      <div className={`orb-card orb-card--loading ${className || ''}`}>
        <p className="orb-loading-text">Memuat Opening Range Breakout &amp; Initial Balance {emiten}…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentPrice,
    tradeDate,
    ib15,
    ib60,
    dayType,
    rangeExpansionFactor,
    v15mVolume,
    confluenceRegime,
    convictionScore,
    advisory,
  } = data;

  const regimeClass = getRegimeClass(confluenceRegime);
  const dayTypeClass = getDayTypeClass(dayType);

  return (
    <div className={`orb-card ${className || ''}`}>
      {/* Header */}
      <div className="orb-header">
        <div>
          <div className="orb-title-row">
            <span className="orb-icon" aria-hidden="true">⚡</span>
            <h3 className="orb-title">Opening Range Breakout (ORB) &amp; Initial Balance</h3>
            <span className={`orb-regime-pill ${regimeClass}`}>
              {confluenceRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="orb-subtitle">
            {emiten} • Harga Terakhir: <strong>{formatPrice(currentPrice)}</strong> as of {tradeDate}
          </p>
        </div>
        <div className="orb-score-badge">
          <span>Skor Konfluensi:</span>
          <strong>{convictionScore}/100</strong>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className={`orb-advisory ${regimeClass}`}>
        <span className="orb-advisory-text">{advisory}</span>
      </div>

      {/* 4-Box Initial Balance Grid */}
      <div className="orb-grid">
        {/* Box 1: IB15 (09:00 - 09:15 WIB) */}
        <div className="orb-box orb-box--ib15">
          <div className="orb-box-head">
            <span className="orb-box-name">Initial Balance (IB15)</span>
            <span className="orb-tag-opening">09:00 - 09:15 WIB</span>
          </div>
          <div className="orb-box-content">
            <div className="orb-metric-row">
              <span className="orb-metric-label">IB15 High:</span>
              <strong className="orb-metric-value text-positive">{formatPrice(ib15.high)}</strong>
            </div>
            <div className="orb-metric-row">
              <span className="orb-metric-label">IB15 Low:</span>
              <strong className="orb-metric-value text-negative">{formatPrice(ib15.low)}</strong>
            </div>
            <div className="orb-metric-row">
              <span className="orb-metric-label">Rentang / Midpoint:</span>
              <strong className="orb-metric-value">{formatPrice(ib15.range)} / {formatPrice(ib15.midpoint)}</strong>
            </div>
            <span className="orb-box-meta">
              {ib60 ? `IB60: ${formatPrice(ib60.low)} - ${formatPrice(ib60.high)}` : 'IB60 dalam kalkulasi'}
            </span>
          </div>
        </div>

        {/* Box 2: Upper Extensions (R1 & R2) */}
        <div className="orb-box orb-box--upper">
          <div className="orb-box-head">
            <span className="orb-box-name">Target Ekstensi Atas</span>
            <span className="orb-tag-bullish">+0.5x / +1.0x IB</span>
          </div>
          <div className="orb-box-content">
            <div className="orb-metric-row">
              <span className="orb-metric-label">Ekstensi R1 (+0.5x):</span>
              <strong className="orb-metric-value text-positive">{formatPrice(ib15.extensionR1)}</strong>
            </div>
            <div className="orb-metric-row">
              <span className="orb-metric-label">Ekstensi R2 (+1.0x):</span>
              <strong className="orb-metric-value text-positive">{formatPrice(ib15.extensionR2)}</strong>
            </div>
            <span className="orb-box-meta">
              Target likuiditas kelanjutan momentum breakout
            </span>
          </div>
        </div>

        {/* Box 3: Lower Extensions (S1 & S2) */}
        <div className="orb-box orb-box--lower">
          <div className="orb-box-head">
            <span className="orb-box-name">Target Ekstensi Bawah</span>
            <span className="orb-tag-bearish">-0.5x / -1.0x IB</span>
          </div>
          <div className="orb-box-content">
            <div className="orb-metric-row">
              <span className="orb-metric-label">Ekstensi S1 (-0.5x):</span>
              <strong className="orb-metric-value text-negative">{formatPrice(ib15.extensionS1)}</strong>
            </div>
            <div className="orb-metric-row">
              <span className="orb-metric-label">Ekstensi S2 (-1.0x):</span>
              <strong className="orb-metric-value text-negative">{formatPrice(ib15.extensionS2)}</strong>
            </div>
            <span className="orb-box-meta">
              Batas proteksi invalidasi &amp; support reaktif
            </span>
          </div>
        </div>

        {/* Box 4: Profile Day Type & Volume */}
        <div className="orb-box orb-box--profile">
          <div className="orb-box-head">
            <span className="orb-box-name">Profil Sesi &amp; V15m</span>
            <span className={`orb-day-badge ${dayTypeClass}`}>
              {dayType.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="orb-box-content">
            <div className="orb-metric-row">
              <span className="orb-metric-label">Range Expansion:</span>
              <strong className="orb-metric-value">{rangeExpansionFactor.toFixed(2)}x IB</strong>
            </div>
            <div className="orb-metric-row">
              <span className="orb-metric-label">Volume V15m:</span>
              <strong className="orb-metric-value">{Math.round(v15mVolume).toLocaleString('id-ID')} lot</strong>
            </div>
            <span className="orb-box-meta">
              Steidlmayer Auction Market Profile Framework
            </span>
          </div>
        </div>
      </div>

      {/* Architectural Notice */}
      <div className="orb-notice">
        <span className="orb-notice-icon" aria-hidden="true">🛡️</span>
        <p className="orb-notice-text">
          <strong>Mandat Arsitektur:</strong> Initial Balance dan Opening Range Breakout (ORB)
          berfungsi sebagai penentu presisi eksekusi sesi intraday dan target ekstensi likuiditas.
          Tidak pernah memicu stance <code>ENTER</code> independen tanpa lolos gerbang Playbook G0–G4.
        </p>
      </div>
    </div>
  );
}
