'use client';

import React from 'react';
import type { VcpAssessment, VcpStage } from '@/lib/vcp/types';

export interface VcpPatternCardProps {
  assessment: VcpAssessment;
  className?: string;
}

function getStageBadgeClass(stage: VcpStage): string {
  switch (stage) {
    case 'PIVOT_READY':
      return 'vcp-stage--pivot-ready';
    case 'BREAKOUT_CONFIRMED':
      return 'vcp-stage--breakout';
    case 'FAILED':
      return 'vcp-stage--failed';
    case 'DEVELOPING':
    default:
      return 'vcp-stage--developing';
  }
}

export function VcpPatternCard({ assessment, className }: VcpPatternCardProps) {
  const {
    emiten,
    stage,
    trendTemplate,
    contractionCount,
    contractions,
    pivotPrice,
    stopLossPrice,
    riskPct,
    volumeDryUpRatio,
    isVolumeDriedUp,
    confluenceTag,
    summary,
  } = assessment;

  const stageBadgeClass = getStageBadgeClass(stage);

  return (
    <div className={`vcp-card ${className || ''}`}>
      {/* Header */}
      <div className="vcp-header">
        <div>
          <div className="vcp-title-row">
            <h4 className="vcp-title">VCP &amp; Trend Template: {emiten}</h4>
            <span className={`vcp-stage-pill ${stageBadgeClass}`}>
              {stage.replace('_', ' ')}
            </span>
          </div>
          <p className="vcp-subtitle">
            Volatility Contraction Pattern (SEPA) &amp; Minervini Stage 2 Filter
          </p>
        </div>
        <div className="vcp-contractions-pill">
          <span>Kontraksi:</span>
          <strong>{contractionCount}T</strong>
        </div>
      </div>

      {/* Confluence / Alert Banner */}
      {confluenceTag && (
        <div className={`vcp-banner ${stage === 'FAILED' ? 'vcp-banner--danger' : 'vcp-banner--accent'}`}>
          <span className="vcp-banner-icon">
            {stage === 'PIVOT_READY' ? '🎯' : stage === 'BREAKOUT_CONFIRMED' ? '🚀' : stage === 'FAILED' ? '⚠️' : '⏳'}
          </span>
          <span className="vcp-banner-text">{summary}</span>
        </div>
      )}

      {/* Contraction Waves Visualizer */}
      <div className="vcp-section">
        <div className="vcp-section-title">
          <span>Struktur Kontraksi Volatilitas (Waves)</span>
          {isVolumeDriedUp && (
            <span className="vcp-dryup-badge">💧 Volume Mengering ({volumeDryUpRatio}x MA50)</span>
          )}
        </div>

        {contractions.length > 0 ? (
          <div className="vcp-waves-grid">
            {contractions.map((wave) => (
              <div key={wave.waveIndex} className="vcp-wave-box">
                <div className="vcp-wave-header">
                  <span className="vcp-wave-label">Wave T{wave.waveIndex}</span>
                  <strong className="vcp-wave-depth">-{wave.depthPct}%</strong>
                </div>
                <div className="vcp-wave-meter">
                  <div
                    className="vcp-wave-meter-fill"
                    style={{ width: `${Math.min(100, Math.max(10, wave.depthPct * 2.5))}%` }}
                  />
                </div>
                <div className="vcp-wave-footer">
                  <span>Rp {wave.highPrice.toLocaleString('id-ID')}</span>
                  <span>↓</span>
                  <span>Rp {wave.lowPrice.toLocaleString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="vcp-empty-waves">
            Base konsolidasi sedang berkembang atau belum membentuk 2 gelombang kontraksi teratur.
          </div>
        )}
      </div>

      {/* Execution Pricing Grid */}
      <div className="vcp-exec-grid">
        <div className="vcp-exec-item vcp-exec--pivot">
          <span className="vcp-exec-label">Cheat / Pivot Trigger</span>
          <strong className="vcp-exec-value">
            {pivotPrice ? `Rp ${pivotPrice.toLocaleString('id-ID')}` : '—'}
          </strong>
          <span className="vcp-exec-hint">Level konfirmasi breakout</span>
        </div>
        <div className="vcp-exec-item vcp-exec--stop">
          <span className="vcp-exec-label">Invalidation Stop</span>
          <strong className="vcp-exec-value">
            {stopLossPrice ? `Rp ${stopLossPrice.toLocaleString('id-ID')}` : '—'}
          </strong>
          <span className="vcp-exec-hint">1 tick di bawah wave terakhir</span>
        </div>
        <div className="vcp-exec-item vcp-exec--risk">
          <span className="vcp-exec-label">Resiko Asimetris</span>
          <strong className="vcp-exec-value">
            {riskPct !== null ? `${riskPct}%` : '—'}
          </strong>
          <span className="vcp-exec-hint">Jarak resiko pivot ke stop</span>
        </div>
        <div className="vcp-exec-item vcp-exec--vol">
          <span className="vcp-exec-label">Volume Dry-Up</span>
          <strong className="vcp-exec-value">
            {volumeDryUpRatio !== null ? `${volumeDryUpRatio}x` : '—'}
          </strong>
          <span className="vcp-exec-hint">vs SMA50 volume</span>
        </div>
      </div>

      {/* Minervini Trend Template Checklist */}
      <div className="vcp-template-section">
        <div className="vcp-section-title">
          <span>Minervini Trend Template (Stage 2)</span>
          <span className={`vcp-template-status ${trendTemplate.passed ? 'passed' : 'pending'}`}>
            {trendTemplate.passed ? '✓ STAGE 2 TERKONFIRMASI' : 'TIDAK LOLOS'}
          </span>
        </div>

        <div className="vcp-template-grid">
          <div className={`vcp-template-item ${trendTemplate.priceAboveSma50 && trendTemplate.priceAboveSma150 && trendTemplate.priceAboveSma200 ? 'valid' : 'invalid'}`}>
            <span className="vcp-chk-icon">{trendTemplate.priceAboveSma50 ? '✓' : '✗'}</span>
            <span>Harga di atas SMA 50, 150 &amp; 200</span>
          </div>
          <div className={`vcp-template-item ${trendTemplate.smaAlignment ? 'valid' : 'invalid'}`}>
            <span className="vcp-chk-icon">{trendTemplate.smaAlignment ? '✓' : '✗'}</span>
            <span>Urutan Rata-rata: SMA 50 &gt; 150 &gt; 200</span>
          </div>
          <div className={`vcp-template-item ${trendTemplate.sma200TrendingUp ? 'valid' : 'invalid'}`}>
            <span className="vcp-chk-icon">{trendTemplate.sma200TrendingUp ? '✓' : '✗'}</span>
            <span>Kemiringan SMA 200 Naik (&gt; 20 sesi)</span>
          </div>
          <div className={`vcp-template-item ${trendTemplate.within25Pct52wHigh ? 'valid' : 'invalid'}`}>
            <span className="vcp-chk-icon">{trendTemplate.within25Pct52wHigh ? '✓' : '✗'}</span>
            <span>Jarak dari High 52-Minggu &le; 25% ({trendTemplate.pctFrom52wHigh}%)</span>
          </div>
          <div className={`vcp-template-item ${trendTemplate.atLeast25PctAbove52wLow ? 'valid' : 'invalid'}`}>
            <span className="vcp-chk-icon">{trendTemplate.atLeast25PctAbove52wLow ? '✓' : '✗'}</span>
            <span>Jarak dari Low 52-Minggu &ge; 25% (+{trendTemplate.pctFrom52wLow}%)</span>
          </div>
          <div className={`vcp-template-item ${trendTemplate.passed ? 'valid' : 'invalid'}`}>
            <span className="vcp-chk-icon">{trendTemplate.passed ? '✓' : '✗'}</span>
            <span>Kriteria Superperformance SEPA Penuh</span>
          </div>
        </div>
      </div>

      {/* Non-Negotiable System Invariant Notice */}
      <div className="vcp-footer-note">
        🛡️ <strong>Mandat Arsitektur:</strong> Pola VCP dan Trend Template berfungsi sebagai filter kompresi risiko &amp; penemuan setup. Keputusan entri live tetap wajib lolos Playbook G0–G4.
      </div>
    </div>
  );
}
