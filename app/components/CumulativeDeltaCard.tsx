'use client';

import React, { useEffect, useState } from 'react';
import type {
  CvdAssessment,
  CvdRegime,
  CvdDivergenceType,
} from '@/lib/cvd/types';

export interface CumulativeDeltaCardProps {
  emiten: string;
  initialData?: CvdAssessment | null;
  className?: string;
}

function getRegimeClass(regime: CvdRegime): string {
  switch (regime) {
    case 'BULLISH_CVD_ABSORPTION':
      return 'cvd-regime--absorption';
    case 'AGGRESSIVE_MARKET_MARKUP':
      return 'cvd-regime--markup';
    case 'BEARISH_CVD_EXHAUSTION':
      return 'cvd-regime--exhaustion';
    case 'AGGRESSIVE_MARKET_MARKDOWN':
      return 'cvd-regime--markdown';
    default:
      return 'cvd-regime--neutral';
  }
}

function getDivergenceBadgeClass(div: CvdDivergenceType): string {
  switch (div) {
    case 'BULLISH_CVD_ABSORPTION':
      return 'badge-absorption';
    case 'BEARISH_CVD_EXHAUSTION':
      return 'badge-exhaustion';
    default:
      return 'badge-none';
  }
}

function formatShares(val?: number | null): string {
  if (val == null || isNaN(val)) return '-';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '+';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B lot`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M lot`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K lot`;
  return `${sign}${abs.toLocaleString('id-ID')} lot`;
}

function formatIDR(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  return `${sign}${abs.toLocaleString('id-ID')}`;
}

export function CumulativeDeltaCard({
  emiten,
  initialData,
  className,
}: CumulativeDeltaCardProps) {
  const [data, setData] = useState<CvdAssessment | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchCvd() {
      setLoading(true);
      try {
        const res = await fetch(`/api/radar/cvd?emiten=${encodeURIComponent(emiten)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success' && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.warn(`[CumulativeDeltaCard] Failed to fetch CVD for ${emiten}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchCvd();
    return () => {
      isMounted = false;
    };
  }, [emiten, initialData]);

  if (loading) {
    return (
      <div className={`cvd-card cvd-card--loading ${className || ''}`}>
        <p className="cvd-loading-text">Memuat Cumulative Volume Delta (CVD) &amp; Agresi Tape {emiten}…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentPrice,
    tradeDate,
    cvd,
    aggression,
    divergence,
    confluenceRegime,
    convictionScore,
    advisory,
  } = data;

  const regimeClass = getRegimeClass(confluenceRegime);
  const divClass = getDivergenceBadgeClass(divergence);

  return (
    <div className={`cvd-card ${className || ''}`}>
      {/* Header */}
      <div className="cvd-header">
        <div>
          <div className="cvd-title-row">
            <span className="cvd-icon" aria-hidden="true">📊</span>
            <h3 className="cvd-title">Cumulative Volume Delta (CVD) &amp; Tape Aggression</h3>
            <span className={`cvd-regime-pill ${regimeClass}`}>
              {confluenceRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="cvd-subtitle">
            {emiten} • Harga Terakhir: <strong>Rp {Math.round(currentPrice).toLocaleString('id-ID')}</strong> as of {tradeDate}
          </p>
        </div>
        <div className="cvd-score-badge">
          <span>Skor Konfluensi:</span>
          <strong>{convictionScore}/100</strong>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className={`cvd-advisory ${regimeClass}`}>
        <span className="cvd-advisory-text">{advisory}</span>
      </div>

      {/* 4-Box Order Flow Grid */}
      <div className="cvd-grid">
        {/* Box 1: Cumulative Volume Delta */}
        <div className="cvd-box cvd-box--cvd">
          <div className="cvd-box-head">
            <span className="cvd-box-name">Cumulative Volume Delta</span>
            <span className={`cvd-trend-badge ${cvd.trend === 'ACCUMULATING' ? 'trend-accum' : cvd.trend === 'DISTRIBUTING' ? 'trend-dist' : 'trend-neutral'}`}>
              {cvd.trend}
            </span>
          </div>
          <div className="cvd-box-content">
            <div className="cvd-metric-row">
              <span className="cvd-metric-label">CVD (20 Sesi):</span>
              <strong className={`cvd-metric-value ${cvd.cvd20d >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatShares(cvd.cvd20d)}
              </strong>
            </div>
            <div className="cvd-metric-row">
              <span className="cvd-metric-label">CVD (50 Sesi):</span>
              <strong className={`cvd-metric-value ${cvd.cvd50d >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatShares(cvd.cvd50d)}
              </strong>
            </div>
            <div className="cvd-metric-row">
              <span className="cvd-metric-label">Delta Ratio (% Vol):</span>
              <strong className={`cvd-metric-value ${cvd.deltaRatioPct >= 0 ? 'text-positive' : 'text-negative'}`}>
                {cvd.deltaRatioPct >= 0 ? `+${cvd.deltaRatioPct}%` : `${cvd.deltaRatioPct}%`}
              </strong>
            </div>
            <span className="cvd-box-meta">
              Akumulasi delta bersih pembeli pasar vs penjual pasar
            </span>
          </div>
        </div>

        {/* Box 2: Foreign Tape Aggression */}
        <div className="cvd-box cvd-box--aggression">
          <div className="cvd-box-head">
            <span className="cvd-box-name">Agresi Tape Asing</span>
            <span className={`cvd-aggression-badge ${aggression.status === 'DOMINANT_BUY_AGGRESSION' ? 'aggression-buy' : aggression.status === 'DOMINANT_SELL_AGGRESSION' ? 'aggression-sell' : 'aggression-balanced'}`}>
              {aggression.status === 'DOMINANT_BUY_AGGRESSION' ? 'HAKA DOMINAN' : aggression.status === 'DOMINANT_SELL_AGGRESSION' ? 'HAKI DOMINAN' : 'BALANCED'}
            </span>
          </div>
          <div className="cvd-box-content">
            <div className="cvd-metric-row">
              <span className="cvd-metric-label">Rasio Beli Agresif:</span>
              <strong className="cvd-metric-value text-positive">{(aggression.aggressionRatio * 100).toFixed(1)}%</strong>
            </div>
            <div className="cvd-metric-row">
              <span className="cvd-metric-label">Beli Asing (HAKA):</span>
              <strong className="cvd-metric-value">{formatIDR(aggression.foreignBuyValue)}</strong>
            </div>
            <div className="cvd-metric-row">
              <span className="cvd-metric-label">Jual Asing (HAKI):</span>
              <strong className="cvd-metric-value">{formatIDR(aggression.foreignSellValue)}</strong>
            </div>
            <span className="cvd-box-meta">
              Partisipasi order pasar institusi asing pada continuous tape
            </span>
          </div>
        </div>

        {/* Box 3: Order Flow Divergence */}
        <div className="cvd-box cvd-box--divergence">
          <div className="cvd-box-head">
            <span className="cvd-box-name">Divergensi Order Flow</span>
            <span className={`cvd-div-badge ${divClass}`}>
              {divergence === 'BULLISH_CVD_ABSORPTION' ? 'ABSORPSI PASIF' : divergence === 'BEARISH_CVD_EXHAUSTION' ? 'EXHAUSTION' : 'NONE'}
            </span>
          </div>
          <div className="cvd-box-content">
            <div className="cvd-div-status-text">
              {divergence === 'BULLISH_CVD_ABSORPTION'
                ? 'Bullish Absorption aktif: Harga menguji support sementara volume delta terus meningkat. Smart money memasang antrean bid tebal.'
                : divergence === 'BEARISH_CVD_EXHAUSTION'
                ? 'Bearish Exhaustion aktif: Kenaikan harga kehilangan daya dorong delta volume. Waspadai pasokan pasif institusi di offer.'
                : 'Tidak terdeteksi anomali divergensi antara pergerakan harga dan delta volume.'}
            </div>
            <span className="cvd-box-meta">
              Deteksi serapan pasif vs pelemahan agresor
            </span>
          </div>
        </div>

        {/* Box 4: Bar Delta Terkini */}
        <div className="cvd-box cvd-box--bar">
          <div className="cvd-box-head">
            <span className="cvd-box-name">Delta Sesi Terakhir</span>
            <span className="cvd-tag-single">Single Bar</span>
          </div>
          <div className="cvd-box-content">
            <div className="cvd-metric-row">
              <span className="cvd-metric-label">Delta Volume Bar:</span>
              <strong className={`cvd-metric-value ${cvd.currentBarDelta >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatShares(cvd.currentBarDelta)}
              </strong>
            </div>
            <div className="cvd-metric-row">
              <span className="cvd-metric-label">Kondisi Tape:</span>
              <strong className="cvd-metric-value">
                {cvd.currentBarDelta > 0 ? 'Net Buyer Inisiatif' : cvd.currentBarDelta < 0 ? 'Net Seller Inisiatif' : 'Seimbang'}
              </strong>
            </div>
            <span className="cvd-box-meta">
              Kalkulasi bobot Close Location Value (CLV) &amp; perpindahan Open-to-Close
            </span>
          </div>
        </div>
      </div>

      {/* Architectural Notice */}
      <div className="cvd-notice">
        <span className="cvd-notice-icon" aria-hidden="true">🛡️</span>
        <p className="cvd-notice-text">
          <strong>Mandat Arsitektur:</strong> Cumulative Volume Delta (CVD) dan Rasio Agresi Tape
          berfungsi sebagai konfluensi order flow institusional dan deteksi absorpsi pasif.
          Tidak pernah memicu stance <code>ENTER</code> independen tanpa lolos gerbang Playbook G0–G4.
        </p>
      </div>
    </div>
  );
}
