'use client';

import React, { useEffect, useState } from 'react';
import type {
  MtfAssessment,
  MtfRegime,
  WeinsteinStage,
  DailyTrendState,
} from '@/lib/mtf/types';

export interface MultiTimeframeCardProps {
  emiten: string;
  initialData?: MtfAssessment | null;
  className?: string;
}

function getRegimeClass(regime: MtfRegime): string {
  switch (regime) {
    case 'PERFECT_TIDE_ALIGNMENT':
      return 'mtf-regime--perfect';
    case 'HIGH_PROBABILITY_PULLBACK':
      return 'mtf-regime--pullback';
    case 'RANGE_BOUND_COMPRESSION':
      return 'mtf-regime--compression';
    case 'COUNTER_TREND_TRAP_HAZARD':
      return 'mtf-regime--hazard';
    case 'SECULAR_LIQUIDATION':
      return 'mtf-regime--liquidation';
    default:
      return 'mtf-regime--transition';
  }
}

function getStageClass(stage: WeinsteinStage): string {
  switch (stage) {
    case 'STAGE_2_EXPANSION':
      return 'badge-stage-2';
    case 'STAGE_1_BASING':
      return 'badge-stage-1';
    case 'STAGE_3_DISTRIBUTION':
      return 'badge-stage-3';
    case 'STAGE_4_CAPITULATION':
      return 'badge-stage-4';
    default:
      return 'badge-stage-unknown';
  }
}

function getTrendClass(trend: DailyTrendState): string {
  switch (trend) {
    case 'BULLISH_EXPANSION':
      return 'badge-bullish';
    case 'PULLBACK_SUPPORT':
      return 'badge-pullback';
    case 'BEARISH_CONTRACTION':
      return 'badge-bearish';
    default:
      return 'badge-neutral';
  }
}

function formatPrice(val?: number | null): string {
  if (val == null || isNaN(val)) return '-';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

export function MultiTimeframeCard({
  emiten,
  initialData,
  className,
}: MultiTimeframeCardProps) {
  const [data, setData] = useState<MtfAssessment | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchMtf() {
      setLoading(true);
      try {
        const res = await fetch(`/api/radar/mtf?emiten=${encodeURIComponent(emiten)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success' && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.warn(`[MultiTimeframeCard] Failed to fetch MTF for ${emiten}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchMtf();
    return () => {
      isMounted = false;
    };
  }, [emiten, initialData]);

  if (loading) {
    return (
      <div className={`mtf-card mtf-card--loading ${className || ''}`}>
        <p className="mtf-loading-text">Memuat Multi-Timeframe Alignment Matrix {emiten}…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentPrice,
    tradeDate,
    weekly,
    daily,
    alignmentRegime,
    sizingMultiplier,
    alignmentScore,
    advisory,
  } = data;

  const regimeClass = getRegimeClass(alignmentRegime);
  const stageClass = getStageClass(weekly.stage);
  const trendClass = getTrendClass(daily.trendState);

  return (
    <div className={`mtf-card ${className || ''}`}>
      {/* Header */}
      <div className="mtf-header">
        <div>
          <div className="mtf-title-row">
            <span className="mtf-icon" aria-hidden="true">🌊</span>
            <h3 className="mtf-title">Multi-Timeframe Alignment Matrix</h3>
            <span className={`mtf-regime-pill ${regimeClass}`}>
              {alignmentRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="mtf-subtitle">
            {emiten} • Harga Terakhir: <strong>{formatPrice(currentPrice)}</strong> as of {tradeDate}
          </p>
        </div>
        <div className="mtf-score-container">
          <div className="mtf-score-badge">
            <span>Konfluensi:</span>
            <strong>{alignmentScore}/100</strong>
          </div>
          <div className={`mtf-multiplier-badge ${sizingMultiplier >= 1.0 ? 'multiplier-full' : sizingMultiplier > 0 ? 'multiplier-reduced' : 'multiplier-zero'}`}>
            <span>Sizing:</span>
            <strong>{sizingMultiplier.toFixed(2)}x</strong>
          </div>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className={`mtf-advisory ${regimeClass}`}>
        <span className="mtf-advisory-text">{advisory}</span>
      </div>

      {/* 2-Tier Timeframe Grid */}
      <div className="mtf-grid">
        {/* Higher Timeframe: Weekly Tide (Screen 1) */}
        <div className="mtf-box mtf-box--weekly">
          <div className="mtf-box-head">
            <span className="mtf-box-name">Higher Timeframe (Weekly Tide)</span>
            <span className={`mtf-stage-badge ${stageClass}`}>
              {weekly.stage.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="mtf-box-content">
            <div className="mtf-metric-row">
              <span className="mtf-metric-label">EMA 10w:</span>
              <strong className="mtf-metric-value">{formatPrice(weekly.weeklyEma10)}</strong>
            </div>
            <div className="mtf-metric-row">
              <span className="mtf-metric-label">EMA 30w:</span>
              <strong className="mtf-metric-value">{formatPrice(weekly.weeklyEma30)}</strong>
            </div>
            <div className="mtf-metric-row">
              <span className="mtf-metric-label">Slope 30w:</span>
              <strong className={`mtf-metric-value ${(weekly.slope30wPct ?? 0) >= 0 ? 'text-positive' : 'text-negative'}`}>
                {weekly.slope30wPct != null ? `${weekly.slope30wPct > 0 ? '+' : ''}${weekly.slope30wPct}%` : '-'}
              </strong>
            </div>
            <span className="mtf-box-meta">
              Sample: {weekly.weeklyBarsCount} minggu kalender
            </span>
          </div>
        </div>

        {/* Intermediate Timeframe: Daily Wave (Screen 2) */}
        <div className="mtf-box mtf-box--daily">
          <div className="mtf-box-head">
            <span className="mtf-box-name">Intermediate Timeframe (Daily Wave)</span>
            <span className={`mtf-trend-badge ${trendClass}`}>
              {daily.trendState.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="mtf-box-content">
            <div className="mtf-metric-row">
              <span className="mtf-metric-label">EMA 20:</span>
              <strong className="mtf-metric-value">{formatPrice(daily.dailyEma20)}</strong>
            </div>
            <div className="mtf-metric-row">
              <span className="mtf-metric-label">SMA 50:</span>
              <strong className="mtf-metric-value">{formatPrice(daily.dailySma50)}</strong>
            </div>
            <div className="mtf-metric-row">
              <span className="mtf-metric-label">SMA 200:</span>
              <strong className="mtf-metric-value">{formatPrice(daily.dailySma200)}</strong>
            </div>
            <div className="mtf-ma-badges">
              <span className={`mtf-ma-pill ${daily.priceAboveEma20 ? 'pill-pass' : 'pill-fail'}`}>
                {daily.priceAboveEma20 ? '✓' : '✗'} &gt; EMA20
              </span>
              <span className={`mtf-ma-pill ${daily.priceAboveSma50 ? 'pill-pass' : 'pill-fail'}`}>
                {daily.priceAboveSma50 ? '✓' : '✗'} &gt; SMA50
              </span>
              <span className={`mtf-ma-pill ${daily.priceAboveSma200 ? 'pill-pass' : 'pill-fail'}`}>
                {daily.priceAboveSma200 ? '✓' : '✗'} &gt; SMA200
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Architectural Notice */}
      <div className="mtf-notice">
        <span className="mtf-notice-icon" aria-hidden="true">🛡️</span>
        <p className="mtf-notice-text">
          <strong>Mandat Arsitektur:</strong> Multi-Timeframe Alignment Matrix mengintegrasikan
          metodologi Triple Screen Elder dan Stage Analysis Weinstein untuk memvalidasi keselarasan
          arah tren mingguan dan harian. Berfungsi sebagai penskala ukuran lot &amp; filter risiko; tidak
          pernah mengubah stance Playbook G0–G4.
        </p>
      </div>
    </div>
  );
}
