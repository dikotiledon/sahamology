'use client';

import React, { useEffect, useState } from 'react';
import type {
  AnchoredVwapResult,
  VwapConfluenceRegime,
} from '@/lib/vwap/types';

export interface AnchoredVwapCardProps {
  emiten: string;
  initialData?: AnchoredVwapResult | null;
  className?: string;
}

function getRegimeClass(regime: VwapConfluenceRegime): string {
  switch (regime) {
    case 'AT_INSTITUTIONAL_DEFENSE':
      return 'avwap-regime--defense';
    case 'ABOVE_ALL_ANCHORS_EXPANSION':
      return 'avwap-regime--expansion';
    case 'OVEREXTENDED_VALUE_EXHAUSTION':
      return 'avwap-regime--exhaustion';
    case 'TRAPPED_BELOW_CLIMAX':
      return 'avwap-regime--trapped';
    case 'INSTITUTIONAL_CAPITULATION_BREAKDOWN':
      return 'avwap-regime--capitulation';
    default:
      return 'avwap-regime--defense';
  }
}

function formatPrice(val?: number | null): string {
  if (val == null || isNaN(val)) return '-';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

export function AnchoredVwapCard({
  emiten,
  initialData,
  className,
}: AnchoredVwapCardProps) {
  const [data, setData] = useState<AnchoredVwapResult | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchAvwap() {
      setLoading(true);
      try {
        const res = await fetch(`/api/radar/avwap?emiten=${encodeURIComponent(emiten)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success' && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.warn(`[AnchoredVwapCard] Failed to fetch AVWAP for ${emiten}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchAvwap();
    return () => {
      isMounted = false;
    };
  }, [emiten, initialData]);

  if (loading) {
    return (
      <div className={`avwap-card avwap-card--loading ${className || ''}`}>
        <p className="avwap-loading-text">Memuat Anchored VWAP &amp; Bandar Benchmark {emiten}…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentPrice,
    tradeDate,
    baseAnchor,
    volumeClimaxAnchor,
    high52wAnchor,
    bandarVwapTop3,
    bandarVwapTop5,
    confluenceRegime,
    regimeScore,
    advisory,
    spreadToBasePct,
    spreadToBandarPct,
  } = data;

  const regimeClass = getRegimeClass(confluenceRegime);

  return (
    <div className={`avwap-card ${className || ''}`}>
      {/* Header */}
      <div className="avwap-header">
        <div>
          <div className="avwap-title-row">
            <span className="avwap-anchor-icon" aria-hidden="true">⚓</span>
            <h3 className="avwap-title">Anchored VWAP &amp; Bandar Benchmark</h3>
            <span className={`avwap-regime-pill ${regimeClass}`}>
              {confluenceRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="avwap-subtitle">
            {emiten} • Harga Terakhir: <strong>{formatPrice(currentPrice)}</strong> as of {tradeDate}
          </p>
        </div>
        <div className="avwap-score-badge">
          <span>Skor Konfluensi:</span>
          <strong>{regimeScore}/100</strong>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className={`avwap-advisory ${regimeClass}`}>
        <span className="avwap-advisory-text">{advisory}</span>
      </div>

      {/* Benchmark Grid */}
      <div className="avwap-grid">
        {/* Base Accumulation AVWAP */}
        <div className="avwap-box avwap-box--base">
          <div className="avwap-box-head">
            <span className="avwap-box-name">AVWAP Basis Akumulasi</span>
            <span className={`avwap-spread-badge ${spreadToBasePct >= 0 ? 'text-positive' : 'text-negative'}`}>
              {spreadToBasePct >= 0 ? `+${spreadToBasePct}%` : `${spreadToBasePct}%`}
            </span>
          </div>
          <strong className="avwap-box-price">{formatPrice(baseAnchor.vwap)}</strong>
          <div className="avwap-channel-levels">
            <span>-1σ: {formatPrice(baseAnchor.lowerBand1sd)}</span>
            <span>+1σ: {formatPrice(baseAnchor.upperBand1sd)}</span>
          </div>
          <span className="avwap-box-meta">
            Anchor: {baseAnchor.anchorDate} ({baseAnchor.sampleBars} sesi)
          </span>
        </div>

        {/* Volume Climax AVWAP */}
        <div className="avwap-box avwap-box--climax">
          <div className="avwap-box-head">
            <span className="avwap-box-name">AVWAP Klimaks Volume Terbesar</span>
            {volumeClimaxAnchor && (
              <span className={`avwap-spread-badge ${currentPrice >= volumeClimaxAnchor.vwap ? 'text-positive' : 'text-negative'}`}>
                {currentPrice >= volumeClimaxAnchor.vwap ? 'Di Atas' : 'Di Bawah'}
              </span>
            )}
          </div>
          <strong className="avwap-box-price">
            {volumeClimaxAnchor ? formatPrice(volumeClimaxAnchor.vwap) : '-'}
          </strong>
          <div className="avwap-channel-levels">
            {volumeClimaxAnchor ? (
              <>
                <span>Rentang: ±{volumeClimaxAnchor.stdDev} IDR</span>
                <span>{volumeClimaxAnchor.sampleBars} sesi</span>
              </>
            ) : (
              <span>Bar klimaks belum terdeteksi</span>
            )}
          </div>
          <span className="avwap-box-meta">
            Anchor: {volumeClimaxAnchor?.anchorDate || '-'}
          </span>
        </div>

        {/* Bandar VWAP (Broker Summary Benchmark) */}
        <div className="avwap-box avwap-box--bandar">
          <div className="avwap-box-head">
            <span className="avwap-box-name">Bandar VWAP (Top 3 Broker)</span>
            {spreadToBandarPct != null && (
              <span className={`avwap-spread-badge ${spreadToBandarPct >= 0 ? 'text-positive' : 'text-negative'}`}>
                {spreadToBandarPct >= 0 ? `+${spreadToBandarPct}%` : `${spreadToBandarPct}%`}
              </span>
            )}
          </div>
          <strong className="avwap-box-price">
            {bandarVwapTop3 ? formatPrice(bandarVwapTop3) : '-'}
          </strong>
          <div className="avwap-channel-levels">
            <span>Top 5 VWAP: {bandarVwapTop5 ? formatPrice(bandarVwapTop5) : '-'}</span>
          </div>
          <span className="avwap-box-meta">
            Modal akumulasi terbobot broker summary EOD
          </span>
        </div>

        {/* 52-Week High AVWAP */}
        <div className="avwap-box avwap-box--high52">
          <div className="avwap-box-head">
            <span className="avwap-box-name">AVWAP Puncak 52-Minggu</span>
            {high52wAnchor && (
              <span className={`avwap-spread-badge ${currentPrice >= high52wAnchor.vwap ? 'text-positive' : 'text-negative'}`}>
                {currentPrice >= high52wAnchor.vwap ? 'Breakout' : 'Trapped Supply'}
              </span>
            )}
          </div>
          <strong className="avwap-box-price">
            {high52wAnchor ? formatPrice(high52wAnchor.vwap) : '-'}
          </strong>
          <div className="avwap-channel-levels">
            <span>Titik Pasokan Tertinggi</span>
          </div>
          <span className="avwap-box-meta">
            Anchor: {high52wAnchor?.anchorDate || '-'}
          </span>
        </div>
      </div>

      {/* Non-Negotiable System Boundary */}
      <div className="avwap-footer-notice">
        🛡️ <strong>Mandat Arsitektur:</strong> Anchored VWAP &amp; Bandar VWAP memetakan rata-rata modal institusi untuk konfluensi support/resistance. Keputusan eksekusi tetap wajib lolos validasi Playbook G0–G4.
      </div>
    </div>
  );
}
