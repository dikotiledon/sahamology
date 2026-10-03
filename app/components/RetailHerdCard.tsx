'use client';

import React, { useEffect, useState } from 'react';
import type {
  RhiAssessment,
  RhiRegime,
} from '@/lib/rhi/types';

export interface RetailHerdCardProps {
  emiten: string;
  initialData?: RhiAssessment | null;
  className?: string;
}

function getRegimeClass(regime: RhiRegime): string {
  switch (regime) {
    case 'INSTITUTIONAL_STEALTH_ACCUMULATION':
      return 'rhi-regime--stealth';
    case 'SYNDICATE_DOMINANT_FLOW':
      return 'rhi-regime--syndicate';
    case 'RETAIL_PANIC_CAPITULATION':
      return 'rhi-regime--panic';
    case 'RETAIL_HERD_FOMO_TRAP':
      return 'rhi-regime--trap';
    default:
      return 'rhi-regime--balanced';
  }
}

function formatIDR(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  return `${sign}${abs.toLocaleString('id-ID')}`;
}

export function RetailHerdCard({
  emiten,
  initialData,
  className,
}: RetailHerdCardProps) {
  const [data, setData] = useState<RhiAssessment | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchRhi() {
      setLoading(true);
      try {
        const res = await fetch(`/api/radar/rhi?emiten=${encodeURIComponent(emiten)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success' && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.warn(`[RetailHerdCard] Failed to fetch RHI for ${emiten}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchRhi();
    return () => {
      isMounted = false;
    };
  }, [emiten, initialData]);

  if (loading) {
    return (
      <div className={`rhi-card rhi-card--loading ${className || ''}`}>
        <p className="rhi-loading-text">Memuat Retail Herd Index &amp; Sindikat Asimetris {emiten}…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentPrice,
    tradeDate,
    rhiScore,
    retail,
    syndicate,
    confluenceRegime,
    convictionScore,
    advisory,
  } = data;

  const regimeClass = getRegimeClass(confluenceRegime);

  return (
    <div className={`rhi-card ${className || ''}`}>
      {/* Header */}
      <div className="rhi-header">
        <div>
          <div className="rhi-title-row">
            <span className="rhi-icon" aria-hidden="true">👥</span>
            <h3 className="rhi-title">Retail Herd Index &amp; Sindikat Asimetris</h3>
            <span className={`rhi-regime-pill ${regimeClass}`}>
              {confluenceRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="rhi-subtitle">
            {emiten} • Harga Terakhir: <strong>Rp {Math.round(currentPrice).toLocaleString('id-ID')}</strong> as of {tradeDate}
          </p>
        </div>
        <div className="rhi-score-badge">
          <span>Skor Konfluensi:</span>
          <strong>{convictionScore}/100</strong>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className={`rhi-advisory ${regimeClass}`}>
        <span className="rhi-advisory-text">{advisory}</span>
      </div>

      {/* 4-Box Microstructure Grid */}
      <div className="rhi-grid">
        {/* Box 1: Retail Herd Index (RHI Score) */}
        <div className="rhi-box rhi-box--rhi">
          <div className="rhi-box-head">
            <span className="rhi-box-name">Retail Herd Index (RHI)</span>
            <span className={`rhi-score-badge-pill ${rhiScore >= 70 ? 'badge-rhi-high' : rhiScore <= 32 ? 'badge-rhi-low' : 'badge-rhi-mid'}`}>
              {rhiScore >= 70 ? 'CROWDED TRAP' : rhiScore <= 32 ? 'STEALTH ACCUM' : 'BALANCED'}
            </span>
          </div>
          <div className="rhi-box-content">
            <div className="rhi-big-score-row">
              <span className="rhi-big-score-num">{rhiScore}</span>
              <span className="rhi-big-score-total">/100</span>
            </div>
            <span className="rhi-box-meta">
              Skor &le; 30 mengindikasikan akumulasi senyap; &ge; 70 mengindikasikan risiko jebakan ritel
            </span>
          </div>
        </div>

        {/* Box 2: Syndicate Asymmetry Ratio (SAR) */}
        <div className="rhi-box rhi-box--syndicate">
          <div className="rhi-box-head">
            <span className="rhi-box-name">Sindikat Asimetris (Top-3)</span>
            <span className="rhi-sar-badge text-positive">{syndicate.syndicateAsymmetryRatio}x SAR</span>
          </div>
          <div className="rhi-box-content">
            <div className="rhi-metric-row">
              <span className="rhi-metric-label">Net Buy Top-3:</span>
              <strong className="rhi-metric-value text-positive">{formatIDR(syndicate.top3NetBuyValue)}</strong>
            </div>
            <div className="rhi-metric-row">
              <span className="rhi-metric-label">Konsentrasi Top-3:</span>
              <strong className="rhi-metric-value">{(syndicate.top3ConcentrationRatio * 100).toFixed(1)}%</strong>
            </div>
            <div className="rhi-metric-row">
              <span className="rhi-metric-label">Top Buyer Sindikat:</span>
              <strong className="rhi-metric-value">{syndicate.topSyndicateBuyer || '-'}</strong>
            </div>
            <span className="rhi-box-meta">
              Rasio kekuatan serapan beli Top-3 terhadap arus ritel
            </span>
          </div>
        </div>

        {/* Box 3: Partisipasi Ritel (YP, PD, XC) */}
        <div className="rhi-box rhi-box--retail">
          <div className="rhi-box-head">
            <span className="rhi-box-name">Partisipan Ritel (YP, PD, XC)</span>
            <span className={`rhi-retail-badge ${retail.retailNetBuyValue >= 0 ? 'badge-retail-buy' : 'badge-retail-sell'}`}>
              {retail.retailNetBuyValue >= 0 ? 'NET BUY RITEL' : 'NET SELL RITEL'}
            </span>
          </div>
          <div className="rhi-box-content">
            <div className="rhi-metric-row">
              <span className="rhi-metric-label">Net Flow Ritel:</span>
              <strong className={`rhi-metric-value ${retail.retailNetBuyValue >= 0 ? 'text-positive' : 'text-negative'}`}>
                {retail.retailNetBuyValue >= 0 ? '+' : ''}{formatIDR(retail.retailNetBuyValue)}
              </strong>
            </div>
            <div className="rhi-metric-row">
              <span className="rhi-metric-label">Partisipasi (% Omzet):</span>
              <strong className="rhi-metric-value">{(retail.retailParticipationRatio * 100).toFixed(1)}%</strong>
            </div>
            <div className="rhi-metric-row">
              <span className="rhi-metric-label">Top Buyer Ritel:</span>
              <strong className="rhi-metric-value">{retail.topRetailBuyer || '-'}</strong>
            </div>
            <span className="rhi-box-meta">
              Aliran agregat broker ritel diskon reguler
            </span>
          </div>
        </div>

        {/* Box 4: Panduan Arah Order Flow */}
        <div className="rhi-box rhi-box--guide">
          <div className="rhi-box-head">
            <span className="rhi-box-name">Status Likuiditas</span>
            <span className="rhi-tag-bandar">Bandarmology</span>
          </div>
          <div className="rhi-box-content">
            <div className="rhi-guide-text">
              {confluenceRegime === 'INSTITUTIONAL_STEALTH_ACCUMULATION'
                ? 'Arus Smart Money sangat menguntungkan: Sindikat mendominasi akumulasi sementara ritel tidak ikut serta. Probabilitas lanjutan tinggi.'
                : confluenceRegime === 'RETAIL_HERD_FOMO_TRAP'
                ? 'Waspadai distribusi tersembunyi: Ritel sangat padat di posisi beli. Jangan mengejar harga (hindari FOMO).'
                : confluenceRegime === 'RETAIL_PANIC_CAPITULATION'
                ? 'Tekanan jual ritel terserap rapi: Area reaktif ideal jika didukung konfluensi support AVWAP/Order Block.'
                : 'Arus partisipan berimbang antara ritel dan institusi. Ikuti konfirmasi gerbang Playbook.'}
            </div>
            <span className="rhi-box-meta">
              Deteksi asimetri partisipan pada broker summary EOD
            </span>
          </div>
        </div>
      </div>

      {/* Architectural Notice */}
      <div className="rhi-notice">
        <span className="rhi-notice-icon" aria-hidden="true">🛡️</span>
        <p className="rhi-notice-text">
          <strong>Mandat Arsitektur:</strong> Retail Herd Index (RHI) dan Rasio Asimetri Sindikat
          berfungsi sebagai filter jebakan ritel dan pengukur akumulasi senyap. Tidak pernah memicu
          stance <code>ENTER</code> independen tanpa lolos gerbang Playbook G0–G4.
        </p>
      </div>
    </div>
  );
}
