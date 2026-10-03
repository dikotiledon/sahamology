'use client';

import React from 'react';
import type { RadarAssessment, RadarVerdict, BrokerTier } from '@/lib/radar/types';

interface InsiderRadarCardProps {
  assessment: RadarAssessment | null;
  loading: boolean;
  error?: string | null;
  emiten: string;
  asOf?: string;
  isInWatchlist?: boolean;
  onToggleWatchlist?: () => void;
}

function formatIDR(val: number): string {
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${abs.toLocaleString('id-ID')}`;
}

function verdictColor(verdict: RadarVerdict): { bg: string; text: string; border: string } {
  switch (verdict) {
    case 'STRONG_ACCUMULATION':
      return { bg: 'rgba(56, 239, 125, 0.15)', text: '#38ef7d', border: '#38ef7d' };
    case 'MODERATE_ACCUMULATION':
      return { bg: 'rgba(102, 126, 234, 0.15)', text: '#667eea', border: '#667eea' };
    case 'MODERATE_DISTRIBUTION':
      return { bg: 'rgba(255, 152, 0, 0.15)', text: '#ff9800', border: '#ff9800' };
    case 'HEAVY_DISTRIBUTION':
      return { bg: 'rgba(245, 87, 108, 0.15)', text: '#f5576c', border: '#f5576c' };
    default:
      return { bg: 'rgba(160, 160, 184, 0.1)', text: 'var(--text-secondary)', border: 'var(--border-color)' };
  }
}

function tierBadge(tier: BrokerTier): { text: string; bg: string; color: string } {
  switch (tier) {
    case 'FOREIGN_CUSTODIAN':
      return { text: 'Asing Custodian', bg: 'rgba(56, 239, 125, 0.15)', color: '#38ef7d' };
    case 'BOUTIQUE_AFFILIATED':
      return { text: 'Boutique/Afiliasi', bg: 'rgba(102, 126, 234, 0.15)', color: '#667eea' };
    case 'DOMESTIC_INSTITUTION':
      return { text: 'Institusi Domestik', bg: 'rgba(0, 180, 216, 0.15)', color: '#00b4d8' };
    case 'RETAIL':
      return { text: 'Ritel', bg: 'rgba(255, 152, 0, 0.15)', color: '#ff9800' };
    default:
      return { text: 'Lainnya', bg: 'rgba(255, 255, 255, 0.08)', color: 'var(--text-muted)' };
  }
}

export default function InsiderRadarCard({
  assessment,
  loading,
  error,
  emiten,
  asOf,
  isInWatchlist,
  onToggleWatchlist,
}: InsiderRadarCardProps) {
  if (loading) {
    return (
      <div className="glass-card mt-4" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🛰️</span> Brosum Insider Trade Radar
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Memindai asimetri...</span>
        </div>
        <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-secondary)' }}>
          <div className="spinner" style={{ width: '22px', height: '22px', margin: '0 auto 0.75rem' }}></div>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Mengevaluasi akumulasi multi-periode (10d, 20d, 60d), volume anomaly, dan transaksi pasar nego untuk <strong>{emiten}</strong>...
          </p>
        </div>
      </div>
    );
  }

  if (error || !assessment) {
    return (
      <div className="glass-card mt-4" style={{ padding: '1.25rem', borderColor: 'rgba(255, 255, 255, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🛰️</span> Brosum Insider Trade Radar
          </h3>
          {onToggleWatchlist && (
            <button
              onClick={onToggleWatchlist}
              style={{
                background: isInWatchlist ? 'rgba(245, 87, 108, 0.12)' : 'rgba(56, 239, 125, 0.15)',
                border: `1px solid ${isInWatchlist ? 'rgba(245, 87, 108, 0.3)' : '#38ef7d'}`,
                color: isInWatchlist ? 'var(--accent-warning)' : '#38ef7d',
                borderRadius: '6px',
                padding: '0.25rem 0.6rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isInWatchlist ? '🗑️ Hapus Watchlist' : '+ Tambah Watchlist'}
            </button>
          )}
        </div>
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {error || 'Data radar historis belum tersedia untuk emiten ini atau sesi belum ditutup.'}
        </p>
      </div>
    );
  }

  const colors = verdictColor(assessment.verdict);

  return (
    <div className="glass-card mt-4" style={{ padding: '1.25rem', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
              <span>🛰️</span> Brosum Insider Trade Radar
            </h3>
            <span
              style={{
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: 700,
                background: colors.bg,
                color: colors.text,
                border: `1px solid ${colors.border}`,
                whiteSpace: 'nowrap',
              }}
            >
              {assessment.verdict.replace('_', ' ')}
            </span>
          </div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            As of {assessment.asOf || asOf} &bull; Sektor: <strong>{assessment.sector || 'Unclassified'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {onToggleWatchlist && (
            <button
              onClick={onToggleWatchlist}
              style={{
                background: isInWatchlist ? 'rgba(245, 87, 108, 0.12)' : 'rgba(56, 239, 125, 0.15)',
                border: `1px solid ${isInWatchlist ? 'rgba(245, 87, 108, 0.3)' : '#38ef7d'}`,
                color: isInWatchlist ? 'var(--accent-warning)' : '#38ef7d',
                borderRadius: '6px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isInWatchlist ? '🗑️ Di Watchlist' : '+ Tambah Watchlist'}
            </button>
          )}
          <a
            href={`/radar?date=${encodeURIComponent(assessment.asOf || '')}`}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '0.3rem 0.65rem',
              fontSize: '0.75rem',
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            Buka Radar Full ↗
          </a>
        </div>
      </div>

      {/* Radar Score Bar */}
      <div style={{ padding: '0.85rem 1rem', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '10px', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Skor Akumulasi Asimetris (0–100):
          </span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: colors.text }}>
            {assessment.score} / 100
          </span>
        </div>
        <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.min(100, Math.max(0, assessment.score))}%`,
              height: '100%',
              background: assessment.score >= 65 ? '#38ef7d' : assessment.score <= 35 ? '#f5576c' : '#667eea',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Grid of Key Diagnostics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
        {/* Relative Strength vs IHSG */}
        {assessment.relativeStrength && (
          <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Kekuatan Relatif (20d vs IHSG)</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '0.1rem 0.35rem',
                  borderRadius: '4px',
                  background: assessment.relativeStrength.outperforming ? 'rgba(56, 239, 125, 0.15)' : 'rgba(245, 87, 108, 0.15)',
                  color: assessment.relativeStrength.outperforming ? '#38ef7d' : '#f5576c',
                }}
              >
                {assessment.relativeStrength.outperforming ? 'OUTPERFORM' : 'UNDERPERFORM'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-primary)' }}>
              <span>RS Ratio: <strong>{assessment.relativeStrength.rsRatio}x</strong></span>
              <span>Spread: <strong style={{ color: assessment.relativeStrength.perfSpreadPct >= 0 ? '#38ef7d' : '#f5576c' }}>
                {assessment.relativeStrength.perfSpreadPct >= 0 ? '+' : ''}{assessment.relativeStrength.perfSpreadPct}%
              </strong></span>
            </div>
          </div>
        )}

        {/* Volume Anomaly & Silent Accumulation */}
        <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Anomali Volume & Volatilitas</span>
            {assessment.volumeAnomaly.isSilentAccumulation && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(56, 239, 125, 0.2)', color: '#38ef7d' }}>
                SILENT ACCUM
              </span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-primary)' }}>
            <span>Vol / MA50: <strong>{assessment.volumeAnomaly.volumeRatioToSma50.toFixed(1)}x</strong></span>
            <span>Kompresi Rentang: <strong>{assessment.volumeAnomaly.priceVolatilityRatio.toFixed(2)}x</strong></span>
          </div>
        </div>

        {/* Concentration & Retail Absorption */}
        <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Konsentrasi & Absorpsi</span>
            {assessment.concentration.isExtremeConcentration && (
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '4px', background: 'rgba(102, 126, 234, 0.2)', color: '#667eea' }}>
                EKSTREM
              </span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--text-primary)' }}>
            <span>Top 3 Net Buy: <strong>{(assessment.concentration.top3NetValueRatio * 100).toFixed(1)}%</strong></span>
            <span>Absorpsi Ritel: <strong>{assessment.segmentation.isInstitutionalAbsorption ? 'Terdeteksi' : 'Normal'}</strong></span>
          </div>
        </div>

        {/* Multi-Window Flow */}
        <div style={{ padding: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
            Tren Multi-Window Flow
          </span>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem' }}>
            <span style={{ color: assessment.rolling10dScore >= 60 ? '#38ef7d' : assessment.rolling10dScore <= 40 ? '#f5576c' : 'inherit' }}>
              10-Day: <strong>{assessment.rolling10dScore}</strong>
            </span>
            <span style={{ color: assessment.rolling20dScore >= 60 ? '#38ef7d' : assessment.rolling20dScore <= 40 ? '#f5576c' : 'inherit' }}>
              20-Day: <strong>{assessment.rolling20dScore}</strong>
            </span>
            <span style={{ color: assessment.rolling60dScore >= 60 ? '#38ef7d' : assessment.rolling60dScore <= 40 ? '#f5576c' : 'inherit' }}>
              60-Day: <strong>{assessment.rolling60dScore}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Pasar Nego Crossing Alert */}
      {assessment.ngCrossing.hasSignificantCrossing && (
        <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(56, 239, 125, 0.08)', border: '1px solid rgba(56, 239, 125, 0.25)', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.8rem' }}>
          <strong style={{ color: '#38ef7d' }}>🚨 Transaksi Pasar Nego (NG) Signifikan:</strong>{' '}
          <span>
            Crossing {formatIDR(assessment.ngCrossing.ngValue)} oleh broker <strong>{assessment.ngCrossing.crossingBrokers.join(', ')}</strong> (Follow-through RG: {(assessment.ngCrossing.rgFollowThroughScore * 100).toFixed(0)}%).
          </span>
        </div>
      )}

      {/* Top Buyers & Sellers Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem', marginBottom: '1rem' }}>
        {/* Top Accumulators */}
        <div>
          <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', color: '#38ef7d' }}>Top Akumulator (Buyer)</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {assessment.topBuyers.slice(0, 3).map((b) => {
              const badge = tierBadge(b.tier);
              return (
                <div key={b.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '0.76rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <strong>{b.code}</strong>
                    <span style={{ fontSize: '0.65rem', padding: '0.05rem 0.3rem', borderRadius: '3px', background: badge.bg, color: badge.color }}>
                      {badge.text}
                    </span>
                  </div>
                  <span style={{ fontWeight: 600, color: '#38ef7d' }}>+{formatIDR(b.netValue)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Distributers */}
        <div>
          <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.82rem', color: '#f5576c' }}>Top Distribusi (Seller)</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {assessment.topSellers.slice(0, 3).map((s) => {
              const badge = tierBadge(s.tier);
              return (
                <div key={s.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '0.76rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <strong>{s.code}</strong>
                    <span style={{ fontSize: '0.65rem', padding: '0.05rem 0.3rem', borderRadius: '3px', background: badge.bg, color: badge.color }}>
                      {badge.text}
                    </span>
                  </div>
                  <span style={{ fontWeight: 600, color: '#f5576c' }}>{formatIDR(s.netValue)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Verified Evidence List */}
      {assessment.evidence.length > 0 && (
        <div style={{ padding: '0.75rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
          <h5 style={{ margin: '0 0 0.35rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Bukti Diagnostik Terverifikasi (Radar Evidence):
          </h5>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.76rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
            {assessment.evidence.map((ev, idx) => (
              <li key={idx} style={{ marginBottom: '0.2rem' }}>{ev}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Safety Notice Footnote */}
      <div style={{ marginTop: '0.85rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
        🛡️ <strong>Safety Boundary:</strong> Radar bertindak sebagai deteksi asimetri arus modal dan penyaring risiko. Keputusan eksekusi beli <strong>(ENTER)</strong> tetap ditentukan secara eksklusif oleh gerbang playbook G0–G4 di Decision Card.
      </div>
    </div>
  );
}
