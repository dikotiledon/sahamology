'use client';

import React, { useEffect, useState } from 'react';
import type { MarketBreadthMetric, MarketRegime } from '@/lib/breadth/types';

export interface MarketBreadthCardProps {
  initialData?: MarketBreadthMetric | null;
  className?: string;
}

function getRegimeClass(regime: MarketRegime): string {
  switch (regime) {
    case 'BULLISH_EXPANSION':
      return 'breadth-regime--expansion';
    case 'HEALTHY_PULLBACK':
      return 'breadth-regime--pullback';
    case 'BREADTH_DIVERGENCE_WARNING':
      return 'breadth-regime--divergence';
    case 'BEARISH_DISTRIBUTION':
      return 'breadth-regime--distribution';
    case 'OVERSOLD_CAPITULATION':
      return 'breadth-regime--capitulation';
    default:
      return 'breadth-regime--expansion';
  }
}

function formatIDR(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '+';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  return `${sign}${abs.toLocaleString('id-ID')}`;
}

export function MarketBreadthCard({ initialData, className }: MarketBreadthCardProps) {
  const [data, setData] = useState<MarketBreadthMetric | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchBreadth() {
      try {
        const res = await fetch('/api/radar/breadth');
        const json = await res.json();
        if (isMounted && json.status === 'success' && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.warn('[MarketBreadthCard] Failed to fetch breadth data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchBreadth();
    return () => {
      isMounted = false;
    };
  }, [initialData]);

  if (loading) {
    return (
      <div className={`breadth-card breadth-card--loading ${className || ''}`}>
        <p className="breadth-loading-text">Memuat IHSG Market Breadth &amp; Composite Liquidity Pulse…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    tradeDate,
    advancers,
    decliners,
    unchanged,
    adRatio,
    pctAboveEma20,
    pctAboveSma50,
    pctAboveSma200,
    newHighs52w,
    newLows52w,
    netNewHighs,
    netForeignFlow,
    constituentCount,
    marketRegime,
    regimeScore,
    advisory,
  } = data;

  const totalAD = Math.max(1, advancers + decliners + unchanged);
  const advPct = Math.round((advancers / totalAD) * 100);
  const decPct = Math.round((decliners / totalAD) * 100);
  const unchPct = Math.max(0, 100 - advPct - decPct);

  const regimeClass = getRegimeClass(marketRegime);

  return (
    <div className={`breadth-card ${className || ''}`}>
      {/* Header */}
      <div className="breadth-header">
        <div>
          <div className="breadth-title-row">
            <span className="breadth-pulse" aria-hidden="true" />
            <h3 className="breadth-title">IHSG Market Breadth &amp; Liquidity Pulse</h3>
            <span className={`breadth-regime-pill ${regimeClass}`}>
              {marketRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="breadth-subtitle">
            Partisipasi luas pasar bursa IDX ({constituentCount} emiten) as of {tradeDate}
          </p>
        </div>
        <div className="breadth-score-badge">
          <span>Skor Kesehatan:</span>
          <strong>{regimeScore}/100</strong>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className={`breadth-advisory ${regimeClass}`}>
        <span className="breadth-advisory-text">{advisory}</span>
      </div>

      {/* Main Grid: AD Ratio & Moving Average Participation */}
      <div className="breadth-grid">
        {/* Advance / Decline Column */}
        <div className="breadth-col breadth-ad-box">
          <div className="breadth-col-header">
            <span>Rasio Naik / Turun (A/D)</span>
            <strong className="breadth-ad-ratio">{adRatio}x</strong>
          </div>

          {/* Dual/Tri-tone AD Meter Bar */}
          <div className="breadth-meter-bar">
            <div className="breadth-meter-segment breadth-meter--adv" style={{ width: `${advPct}%` }} title={`Naik: ${advancers} (${advPct}%)`} />
            <div className="breadth-meter-segment breadth-meter--unch" style={{ width: `${unchPct}%` }} title={`Tetap: ${unchanged} (${unchPct}%)`} />
            <div className="breadth-meter-segment breadth-meter--dec" style={{ width: `${decPct}%` }} title={`Turun: ${decliners} (${decPct}%)`} />
          </div>

          <div className="breadth-ad-stats">
            <span className="breadth-stat breadth-stat--adv">▲ Naik: {advancers}</span>
            <span className="breadth-stat breadth-stat--unch">■ Tetap: {unchanged}</span>
            <span className="breadth-stat breadth-stat--dec">▼ Turun: {decliners}</span>
          </div>
        </div>

        {/* Moving Average Breadth Column */}
        <div className="breadth-col breadth-ma-box">
          <div className="breadth-col-header">
            <span>Partisipasi Tren Rata-rata</span>
            <span className="breadth-hint">% di atas MA</span>
          </div>

          <div className="breadth-ma-list">
            <div className="breadth-ma-row">
              <span className="breadth-ma-label">&gt; EMA 20 (Momentum)</span>
              <div className="breadth-ma-track">
                <div className="breadth-ma-fill breadth-ma-fill--ema20" style={{ width: `${Math.min(100, pctAboveEma20)}%` }} />
              </div>
              <strong className="breadth-ma-val">{pctAboveEma20}%</strong>
            </div>

            <div className="breadth-ma-row">
              <span className="breadth-ma-label">&gt; SMA 50 (Intermediate)</span>
              <div className="breadth-ma-track">
                <div className="breadth-ma-fill breadth-ma-fill--sma50" style={{ width: `${Math.min(100, pctAboveSma50)}%` }} />
              </div>
              <strong className="breadth-ma-val">{pctAboveSma50}%</strong>
            </div>

            <div className="breadth-ma-row">
              <span className="breadth-ma-label">&gt; SMA 200 (Struktural)</span>
              <div className="breadth-ma-track">
                <div className="breadth-ma-fill breadth-ma-fill--sma200" style={{ width: `${Math.min(100, pctAboveSma200)}%` }} />
              </div>
              <strong className="breadth-ma-val">{pctAboveSma200}%</strong>
            </div>
          </div>
        </div>

        {/* 52-Week High/Low & Foreign Flow Column */}
        <div className="breadth-col breadth-liquidity-box">
          <div className="breadth-col-header">
            <span>Ekspansi 52-Minggu &amp; Aliran Asing</span>
          </div>

          <div className="breadth-stat-tiles">
            <div className="breadth-tile">
              <span className="breadth-tile-label">High / Low 52-Minggu</span>
              <strong className={`breadth-tile-value ${netNewHighs >= 0 ? 'text-positive' : 'text-negative'}`}>
                {netNewHighs >= 0 ? `+${netNewHighs}` : netNewHighs} Net
              </strong>
              <span className="breadth-tile-hint">High: {newHighs52w} | Low: {newLows52w}</span>
            </div>

            <div className="breadth-tile">
              <span className="breadth-tile-label">Net Aliran Asing Bursa</span>
              <strong className={`breadth-tile-value ${netForeignFlow >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatIDR(netForeignFlow)}
              </strong>
              <span className="breadth-tile-hint">Total agregat bursa harian</span>
            </div>
          </div>
        </div>
      </div>

      {/* Non-Negotiable System Boundary */}
      <div className="breadth-footer-notice">
        🛡️ <strong>Mandat Arsitektur:</strong> Market Breadth mengukur pasang-surut pasar agregat untuk alokasi resiko. Keputusan eksekusi tetap wajib diverifikasi oleh Playbook G0–G4.
      </div>
    </div>
  );
}
