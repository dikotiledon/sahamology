'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RadarAssessment, RadarVerdict, SectorFlowSummary } from '@/lib/radar';
import { sessionDateJakarta } from '@/lib/market-calendar';

function todayJakartaHint(): string {
  return sessionDateJakarta(new Date());
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

export default function RadarPage() {
  const [date, setDate] = useState(todayJakartaHint);
  const [items, setItems] = useState<RadarAssessment[]>([]);
  const [sectorFlow, setSectorFlow] = useState<SectorFlowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEmiten, setSelectedEmiten] = useState<RadarAssessment | null>(null);

  const loadRadar = useCallback(async (asOf: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/radar?date=${encodeURIComponent(asOf)}`);
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Gagal memuat radar data');
      }
      setItems(json.data.items || []);
      setSectorFlow(json.data.sectorFlow || []);
    } catch (err) {
      setItems([]);
      setSectorFlow([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRadar(date);
  }, [date, loadRadar]);

  const strongAccumCount = items.filter((i) => i.score >= 65).length;
  const heavyDistCount = items.filter((i) => i.score <= 35).length;
  const extremeConcentrationCount = items.filter((i) => i.concentration.isExtremeConcentration).length;
  const silentAccumCount = items.filter((i) => i.volumeAnomaly.isSilentAccumulation).length;

  return (
    <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem', maxWidth: '1400px' }}>
      {/* Header */}
      <div className="radar-header">
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h1 className="radar-title">Brosum Insider Trade Radar</h1>
          <p className="radar-subtitle">
            Permukaan penemuan asimetri akumulasi EOD multi-periode (10d, 20d, 60d) & Pasar Nego.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            Sesi Tanggal:
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '8px',
              padding: '0.4rem 0.6rem',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>

      {/* Safety Boundary Banner */}
      <div className="glass-card radar-banner">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontWeight: 600,
            color: 'var(--accent-title)',
            fontSize: '0.92rem',
            lineHeight: 1.35,
          }}
        >
          <span>🛡️ Mandat Arsitektur: Radar Penemuan Tidak Pernah Membuka Posisi Sendiri</span>
        </div>
        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          Status deteksi akumulasi bertindak sebagai <strong>RADAR_DETECTED</strong> untuk memasukkan emiten ke antrean analisis.
          Eksekusi beli <strong>ENTER</strong> hanya valid jika seluruh gerbang playbook Adi Sucipto (G0–G4) di <strong>Ranked Desk</strong> terpenuhi.
        </p>
      </div>

      {/* Summary KPI Cards Grid (4-col on desktop, 2x2 grid on mobile <= 900px) */}
      <div className="radar-grid">
        <div className="glass-card radar-kpi-card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Akumulasi Terdeteksi</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#38ef7d', marginTop: '0.15rem' }}>
            {strongAccumCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Score ≥ 65</div>
        </div>

        <div className="glass-card radar-kpi-card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Konsentrasi Ekstrem</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#667eea', marginTop: '0.15rem' }}>
            {extremeConcentrationCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Top 3 Buyer ≥ 60%</div>
        </div>

        <div className="glass-card radar-kpi-card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Silent Accumulation</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#a78bfa', marginTop: '0.15rem' }}>
            {silentAccumCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Vol ≥ 3x MA50</div>
        </div>

        <div className="glass-card radar-kpi-card">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Distribusi Berat</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f5576c', marginTop: '0.15rem' }}>
            {heavyDistCount}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Score ≤ 35</div>
        </div>
      </div>

      {/* Display-Only Sector Flow Distribution Panel */}
      {!loading && sectorFlow.length > 0 && (
        <div className="glass-card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Distribusi Aliran Institusional Sektoral (Display-Only)
              </h3>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Aliran modal bersih institusi & asing berdasarkan klasifikasi sektor IDX.
              </p>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {sectorFlow.length} Sektor Terlacak
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
              gap: '0.75rem',
            }}
          >
            {sectorFlow.map((s) => {
              const isPositive = s.totalNetInstitutionalValue >= 0;
              return (
                <div
                  key={s.sector}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                      {s.sector}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {s.emitenCount} emiten
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Net Institusi:</span>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        color: isPositive ? '#38ef7d' : '#f5576c',
                      }}
                    >
                      {isPositive ? '+' : ''}{formatIDR(s.totalNetInstitutionalValue)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    <span>Skor Radar: {s.averageRadarScore}</span>
                    <span>
                      {s.strongAccumCount > 0 && <span style={{ color: '#38ef7d', marginRight: '0.3rem' }}>▲ {s.strongAccumCount}</span>}
                      {s.heavyDistCount > 0 && <span style={{ color: '#f5576c' }}>▼ {s.heavyDistCount}</span>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading & Error States */}
      {loading && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Memindai broker summary dan volume anomaly...</p>}
      {error && (
        <div className="glass-card" style={{ padding: '1rem', background: 'rgba(245, 87, 108, 0.1)', borderColor: 'var(--accent-warning)', marginBottom: '1.25rem' }}>
          <p style={{ color: 'var(--accent-warning)', margin: 0, fontSize: '0.85rem' }}>{error}</p>
        </div>
      )}

      {/* Mobile Swipe Hint */}
      {!loading && items.length > 0 && (
        <div
          style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            marginBottom: '0.4rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          <span>↔ Geser horizontal untuk melihat seluruh kolom tabel</span>
        </div>
      )}

      {/* Radar Main Table with Horizontal Scroll Container */}
      {!loading && items.length > 0 && (
        <div className="glass-card radar-table-wrap">
          <table className="radar-table">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                <th>Emiten</th>
                <th>Sektor</th>
                <th>Verdict</th>
                <th>Radar Score</th>
                <th>Top 3 Buyer Ratio</th>
                <th>Top Accumulator</th>
                <th>Vol / MA50</th>
                <th>RS vs IHSG (20d)</th>
                <th>10d / 20d Flow</th>
                <th style={{ textAlign: 'center' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const colors = verdictColor(row.verdict);
                return (
                  <tr
                    key={row.emiten}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.emiten}
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {row.sector || 'Others'}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: colors.bg,
                          color: colors.text,
                          border: `1px solid ${colors.border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {row.verdict.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '5px',
                            background: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${row.score}%`,
                              height: '100%',
                              background: row.score >= 65 ? '#38ef7d' : row.score <= 35 ? '#f5576c' : '#a0a0b8',
                            }}
                          />
                        </div>
                        <span style={{ fontWeight: 600 }}>{row.score}</span>
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: row.concentration.top3NetValueRatio >= 0.6 ? 700 : 400 }}>
                        {(row.concentration.top3NetValueRatio * 100).toFixed(1)}%
                      </span>
                      {row.concentration.isExtremeConcentration && (
                        <span style={{ marginLeft: '0.3rem', color: '#667eea', fontSize: '0.72rem', fontWeight: 600 }}>
                          [EKSTREM]
                        </span>
                      )}
                    </td>
                    <td>
                      {row.topBuyers.slice(0, 2).map((b) => (
                        <span key={b.code} style={{ marginRight: '0.35rem', whiteSpace: 'nowrap' }}>
                          <strong>{b.code}</strong> ({formatIDR(b.netValue)})
                        </span>
                      ))}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span>{row.volumeAnomaly.volumeRatioToSma50.toFixed(1)}x</span>
                      {row.volumeAnomaly.isSilentAccumulation && (
                        <span style={{ marginLeft: '0.3rem', color: '#38ef7d', fontSize: '0.72rem', fontWeight: 600 }}>
                          [SILENT]
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {row.relativeStrength ? (
                        <div>
                          <span style={{ fontWeight: 600, color: row.relativeStrength.outperforming ? '#38ef7d' : '#f5576c' }}>
                            {row.relativeStrength.rsRatio.toFixed(2)}x
                          </span>
                          <span style={{ marginLeft: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            ({row.relativeStrength.perfSpreadPct >= 0 ? '+' : ''}{row.relativeStrength.perfSpreadPct}%)
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ color: row.rolling10dScore >= 60 ? '#38ef7d' : row.rolling10dScore <= 40 ? '#f5576c' : 'inherit' }}>
                        10d: {row.rolling10dScore}
                      </span>{' '}
                      |{' '}
                      <span style={{ color: row.rolling20dScore >= 60 ? '#38ef7d' : row.rolling20dScore <= 40 ? '#f5576c' : 'inherit' }}>
                        20d: {row.rolling20dScore}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => setSelectedEmiten(row)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          borderRadius: '6px',
                          padding: '0.2rem 0.45rem',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Inspeksi
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Inspection Modal / Detail Drawer */}
      {selectedEmiten && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '0.75rem',
            boxSizing: 'border-box',
          }}
          onClick={() => setSelectedEmiten(null)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%',
              maxWidth: '650px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.25rem',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              boxSizing: 'border-box',
              borderRadius: '12px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', gap: '0.5rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>
                  Diagnostik Radar: {selectedEmiten.emiten}{' '}
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                    [{selectedEmiten.sector || 'Unclassified'}]
                  </span>
                </h2>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  As of {selectedEmiten.asOf} &bull; Score: {selectedEmiten.score}/100 ({selectedEmiten.verdict})
                </span>
              </div>
              <button
                onClick={() => setSelectedEmiten(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '0.2rem 0.5rem',
                }}
              >
                ✕
              </button>
            </div>

            {/* Display-Only Relative Strength vs IHSG Section */}
            {selectedEmiten.relativeStrength && (
              <div
                style={{
                  padding: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <strong>Kekuatan Relatif vs IHSG (20-Sesi):</strong>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      background: selectedEmiten.relativeStrength.outperforming ? 'rgba(56, 239, 125, 0.15)' : 'rgba(245, 87, 108, 0.15)',
                      color: selectedEmiten.relativeStrength.outperforming ? '#38ef7d' : '#f5576c',
                    }}
                  >
                    {selectedEmiten.relativeStrength.outperforming ? 'OUTPERFORMING' : 'UNDERPERFORMING'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                  <span>Emiten 20d: {selectedEmiten.relativeStrength.emitenReturn20dPct}%</span>
                  <span>IHSG 20d: {selectedEmiten.relativeStrength.ihsgReturn20dPct}%</span>
                  <span>Spread: {selectedEmiten.relativeStrength.perfSpreadPct >= 0 ? '+' : ''}{selectedEmiten.relativeStrength.perfSpreadPct}%</span>
                  <span>RS Ratio: {selectedEmiten.relativeStrength.rsRatio}x</span>
                </div>
              </div>
            )}

            {/* Evidence List */}
            <div style={{ marginBottom: '1.2rem' }}>
              <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Bukti Diagnostik Terverifikasi (Evidence):
              </h4>
              {selectedEmiten.evidence.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Tidak ada anomali signifikan terdeteksi.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {selectedEmiten.evidence.map((ev, idx) => (
                    <li key={idx} style={{ marginBottom: '0.3rem', wordBreak: 'break-word' }}>
                      {ev}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Top Buyers & Sellers Breakdown Responsive Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '0.85rem', marginBottom: '1.2rem' }}>
              <div>
                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.82rem', color: '#38ef7d' }}>Top Pembeli (Akumulasi)</h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {selectedEmiten.topBuyers.map((b) => (
                    <div key={b.code} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span>
                        <strong>{b.code}</strong> <small>({b.tier})</small>
                      </span>
                      <span>{formatIDR(b.netValue)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.82rem', color: '#f5576c' }}>Top Penjual (Distribusi)</h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {selectedEmiten.topSellers.map((s) => (
                    <div key={s.code} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span>
                        <strong>{s.code}</strong> <small>({s.tier})</small>
                      </span>
                      <span>{formatIDR(s.netValue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pasar Nego Cross-Check */}
            <div style={{ padding: '0.7rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.78rem', lineHeight: 1.4, wordBreak: 'break-word' }}>
              <strong>Pasar Nego (NG):</strong>{' '}
              {selectedEmiten.ngCrossing.hasSignificantCrossing ? (
                <span style={{ color: '#38ef7d' }}>
                  Crossing signifikan {formatIDR(selectedEmiten.ngCrossing.ngValue)} oleh {selectedEmiten.ngCrossing.crossingBrokers.join(', ')} (Follow-through RG:{' '}
                  {(selectedEmiten.ngCrossing.rgFollowThroughScore * 100).toFixed(0)}%)
                </span>
              ) : (
                <span style={{ color: 'var(--text-muted)' }}>Tidak ada transaksi crossing signifikan di atas 5B IDR.</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
