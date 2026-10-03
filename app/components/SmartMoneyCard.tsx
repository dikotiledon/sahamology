'use client';

import React, { useEffect, useState } from 'react';
import type {
  SmartMoneyAssessment,
  SmcRegime,
} from '@/lib/smc/types';

export interface SmartMoneyCardProps {
  emiten: string;
  initialData?: SmartMoneyAssessment | null;
  className?: string;
}

function getRegimeClass(regime: SmcRegime): string {
  switch (regime) {
    case 'PRIME_ORDER_BLOCK_DEFENSE':
      return 'smc-regime--defense';
    case 'BOS_BULLISH_EXPANSION':
      return 'smc-regime--expansion';
    case 'LIQUIDITY_SWEEP_REVERSAL':
      return 'smc-regime--sweep';
    case 'FVG_REBALANCING_PULLBACK':
      return 'smc-regime--fvg';
    case 'BEARISH_STRUCTURE_CHOCH':
      return 'smc-regime--choch';
    default:
      return 'smc-regime--neutral';
  }
}

function formatPrice(val?: number | null): string {
  if (val == null || isNaN(val)) return '-';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

export function SmartMoneyCard({
  emiten,
  initialData,
  className,
}: SmartMoneyCardProps) {
  const [data, setData] = useState<SmartMoneyAssessment | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchSmc() {
      setLoading(true);
      try {
        const res = await fetch(`/api/radar/smc?emiten=${encodeURIComponent(emiten)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success' && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.warn(`[SmartMoneyCard] Failed to fetch SMC for ${emiten}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchSmc();
    return () => {
      isMounted = false;
    };
  }, [emiten, initialData]);

  if (loading) {
    return (
      <div className={`smc-card smc-card--loading ${className || ''}`}>
        <p className="smc-loading-text">Memuat Smart Money Concepts (Order Blocks &amp; FVG) {emiten}…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentPrice,
    tradeDate,
    marketStructure,
    lastBOS,
    activeBullishOB,
    activeBullishFVG,
    lastLiquiditySweep,
    confluenceRegime,
    regimeScore,
    advisory,
  } = data;

  const regimeClass = getRegimeClass(confluenceRegime);

  return (
    <div className={`smc-card ${className || ''}`}>
      {/* Header */}
      <div className="smc-header">
        <div>
          <div className="smc-title-row">
            <span className="smc-icon" aria-hidden="true">🧱</span>
            <h3 className="smc-title">Smart Money Concepts: Order Blocks &amp; FVG</h3>
            <span className={`smc-regime-pill ${regimeClass}`}>
              {confluenceRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="smc-subtitle">
            {emiten} • Harga Terakhir: <strong>{formatPrice(currentPrice)}</strong> as of {tradeDate}
          </p>
        </div>
        <div className="smc-score-badge">
          <span>Skor SMC:</span>
          <strong>{regimeScore}/100</strong>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className={`smc-advisory ${regimeClass}`}>
        <span className="smc-advisory-text">{advisory}</span>
      </div>

      {/* 4-Box Structural Grid */}
      <div className="smc-grid">
        {/* 1. Market Structure & BOS */}
        <div className="smc-box smc-box--structure">
          <div className="smc-box-head">
            <span className="smc-box-name">Struktur Pasar &amp; BOS</span>
            <span className={`smc-structure-badge ${marketStructure === 'BULLISH_EXPANSION' ? 'badge-bullish' : marketStructure === 'BEARISH_CONTRACTION' ? 'badge-bearish' : 'badge-neutral'}`}>
              {marketStructure.replace(/_/g, ' ')}
            </span>
          </div>
          {lastBOS ? (
            <div className="smc-box-content">
              <strong className="smc-box-price">{formatPrice(lastBOS.brokenSwingPrice)}</strong>
              <div className="smc-box-meta">
                <span>{lastBOS.type} ({lastBOS.direction})</span>
                <span>Vol: {lastBOS.volumeRatio}x SMA20</span>
                <span>Break: {lastBOS.breakDate}</span>
              </div>
            </div>
          ) : (
            <div className="smc-box-empty">Belum ada BOS terkonfirmasi</div>
          )}
        </div>

        {/* 2. Bullish Order Block */}
        <div className="smc-box smc-box--ob">
          <div className="smc-box-head">
            <span className="smc-box-name">Bullish Order Block (OB)</span>
            {activeBullishOB ? (
              <span className={`smc-mitigation-badge smc-mitigation--${activeBullishOB.mitigationStatus.toLowerCase()}`}>
                {activeBullishOB.mitigationStatus.replace(/_/g, ' ')}
              </span>
            ) : null}
          </div>
          {activeBullishOB ? (
            <div className="smc-box-content">
              <strong className="smc-box-price">
                {formatPrice(activeBullishOB.bottom)} - {formatPrice(activeBullishOB.top)}
              </strong>
              <div className="smc-box-meta">
                <span>Midpoint: {formatPrice(activeBullishOB.midpoint)}</span>
                <span>Origin: {activeBullishOB.originDate}</span>
              </div>
            </div>
          ) : (
            <div className="smc-box-empty">Tidak ada OB aktif di dekat harga</div>
          )}
        </div>

        {/* 3. Fair Value Gap (FVG / BISI) */}
        <div className="smc-box smc-box--fvg">
          <div className="smc-box-head">
            <span className="smc-box-name">Fair Value Gap (FVG)</span>
            {activeBullishFVG ? (
              <span className={`smc-mitigation-badge smc-mitigation--${activeBullishFVG.mitigationStatus.toLowerCase()}`}>
                {activeBullishFVG.mitigationStatus.replace(/_/g, ' ')}
              </span>
            ) : null}
          </div>
          {activeBullishFVG ? (
            <div className="smc-box-content">
              <strong className="smc-box-price">
                {formatPrice(activeBullishFVG.bottom)} - {formatPrice(activeBullishFVG.top)}
              </strong>
              <div className="smc-box-meta">
                <span>CE (50%): {formatPrice(activeBullishFVG.cePrice)}</span>
                <span>Gap: +{activeBullishFVG.gapSizePct}%</span>
              </div>
            </div>
          ) : (
            <div className="smc-box-empty">Tidak ada FVG aktif yang terbuka</div>
          )}
        </div>

        {/* 4. Liquidity Sweep (Stop Hunt) */}
        <div className="smc-box smc-box--sweep">
          <div className="smc-box-head">
            <span className="smc-box-name">Pembersihan Likuiditas</span>
            {lastLiquiditySweep ? (
              <span className="smc-sweep-badge badge-reclaimed">RECLAIMED</span>
            ) : null}
          </div>
          {lastLiquiditySweep ? (
            <div className="smc-box-content">
              <strong className="smc-box-price">{formatPrice(lastLiquiditySweep.sweptPrice)}</strong>
              <div className="smc-box-meta">
                <span>Reclaim: {formatPrice(lastLiquiditySweep.reclaimedPrice)}</span>
                <span>Kedalaman: -{lastLiquiditySweep.sweepDepthPct}%</span>
                <span>Tanggal: {lastLiquiditySweep.sweepDate}</span>
              </div>
            </div>
          ) : (
            <div className="smc-box-empty">Belum ada sweep terbaru</div>
          )}
        </div>
      </div>

      {/* Architectural Notice */}
      <div className="smc-notice">
        <span className="smc-notice-icon" aria-hidden="true">🛡️</span>
        <p className="smc-notice-text">
          <strong>Mandat Arsitektur:</strong> Smart Money Concepts (Order Blocks, FVG, Liquidity Sweeps)
          berfungsi sebagai presisi titik entri/stop loss dan konfluensi reaksi harga institusional.
          Tidak pernah memicu stance <code>ENTER</code> independen tanpa lolos gerbang Playbook G0–G4.
        </p>
      </div>
    </div>
  );
}
