'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RadarAssessment, RadarVerdict, SectorFlowSummary } from '@/lib/radar';
import { sessionDateJakarta } from '@/lib/market-calendar';
import { WyckoffSchematicCard } from '@/app/components/WyckoffSchematicCard';
import type { WyckoffAssessment } from '@/lib/wyckoff/types';
import { VolumeProfileCard } from '@/app/components/VolumeProfileCard';
import type { VolumeProfileResult, VolumeProfileConfluence } from '@/lib/volume-profile';
import { SectorRotationMatrixCard } from '@/app/components/SectorRotationMatrixCard';
import type { SectorRotationMetric } from '@/lib/sector';
import { MarketBreadthCard } from '@/app/components/MarketBreadthCard';
import { VcpPatternCard } from '@/app/components/VcpPatternCard';
import type { VcpAssessment } from '@/lib/vcp/types';

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
  const [wyckoffAssessment, setWyckoffAssessment] = useState<WyckoffAssessment | null>(null);
  const [wyckoffLoading, setWyckoffLoading] = useState(false);
  const [volumeProfile, setVolumeProfile] = useState<VolumeProfileResult | null>(null);
  const [volumeProfileConfluence, setVolumeProfileConfluence] = useState<VolumeProfileConfluence | undefined>(undefined);
  const [volumeProfileLoading, setVolumeProfileLoading] = useState(false);
  const [rotationSectors, setRotationSectors] = useState<SectorRotationMetric[]>([]);
  const [vcpAssessment, setVcpAssessment] = useState<VcpAssessment | null>(null);
  const [vcpLoading, setVcpLoading] = useState(false);

  // Watchlist configuration states
  const [watchlistSymbols, setWatchlistSymbols] = useState<Set<string>>(new Set());
  const [watchlistId, setWatchlistId] = useState<number | null>(null);
  const [newWatchlistSymbol, setNewWatchlistSymbol] = useState('');
  const [addingWatchlist, setAddingWatchlist] = useState(false);
  const [watchlistMessage, setWatchlistMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist');
      const json = await res.json();
      if (json.success) {
        const rawItems = json.data?.data?.result || json.data?.result || json.data || [];
        const symbols = new Set<string>(
          rawItems.map((item: any) => String(item.symbol || item.company_code || '').toUpperCase())
        );
        setWatchlistSymbols(symbols);
        const wId = json.data?.data?.watchlist_id || json.data?.watchlist_id;
        if (wId) {
          setWatchlistId(Number(wId));
        }
      }
    } catch (err) {
      console.warn('[Radar] Could not load watchlist symbols:', err);
    }
  }, []);

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

      try {
        const rotRes = await fetch(`/api/radar/sectors/rotation?date=${encodeURIComponent(asOf)}`);
        const rotJson = await rotRes.json();
        if (rotJson.status === 'success') {
          setRotationSectors(rotJson.sectors || []);
        }
      } catch {
        // Fallback gracefully
      }
    } catch (err) {
      setItems([]);
      setSectorFlow([]);
      setRotationSectors([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRadar(date);
    void loadWatchlist();
  }, [date, loadRadar, loadWatchlist]);

  // Listen to external watchlist changes
  useEffect(() => {
    const handleWatchlistUpdated = () => {
      void loadWatchlist();
      void loadRadar(date);
    };
    window.addEventListener('watchlist-updated', handleWatchlistUpdated);
    return () => window.removeEventListener('watchlist-updated', handleWatchlistUpdated);
  }, [date, loadRadar, loadWatchlist]);

  // Fetch Wyckoff structural assessment & Volume Profile when an emiten is inspected
  useEffect(() => {
    if (!selectedEmiten) {
      setWyckoffAssessment(null);
      setVolumeProfile(null);
      setVolumeProfileConfluence(undefined);
      setVcpAssessment(null);
      return;
    }
    let active = true;
    setWyckoffLoading(true);
    setVolumeProfileLoading(true);
    setVcpLoading(true);

    // 1. Fetch Wyckoff
    fetch(`/api/radar/wyckoff?emiten=${encodeURIComponent(selectedEmiten.emiten)}&date=${encodeURIComponent(date)}`)
      .then((res) => res.json())
      .then((json) => {
        if (active && json.status === 'success' && json.data) {
          setWyckoffAssessment(json.data);
        }
      })
      .catch((err) => {
        console.warn('[Radar] Failed to load Wyckoff assessment:', err);
      })
      .finally(() => {
        if (active) setWyckoffLoading(false);
      });

    // 2. Fetch Volume Profile
    fetch(`/api/radar/volume-profile?emiten=${encodeURIComponent(selectedEmiten.emiten)}&date=${encodeURIComponent(date)}&lookback=20`)
      .then((res) => res.json())
      .then((json) => {
        if (active && json.status === 'success' && json.data) {
          setVolumeProfile(json.data);
          if (json.confluence) {
            setVolumeProfileConfluence(json.confluence);
          }
        }
      })
      .catch((err) => {
        console.warn('[Radar] Failed to load Volume Profile:', err);
      })
      .finally(() => {
        if (active) setVolumeProfileLoading(false);
      });

    // 3. Fetch VCP & Trend Template
    fetch(`/api/radar/vcp?emiten=${encodeURIComponent(selectedEmiten.emiten)}&date=${encodeURIComponent(date)}`)
      .then((res) => res.json())
      .then((json) => {
        if (active && json.status === 'success' && json.data) {
          setVcpAssessment(json.data);
        }
      })
      .catch((err) => {
        console.warn('[Radar] Failed to load VCP assessment:', err);
      })
      .finally(() => {
        if (active) setVcpLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEmiten, date]);

  const handleAddWatchlist = async (symbolToAdd: string) => {
    const clean = symbolToAdd.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(clean)) {
      setWatchlistMessage({ text: 'Kode emiten harus 4 huruf IDX', type: 'error' });
      return;
    }
    setAddingWatchlist(true);
    setWatchlistMessage(null);
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: clean,
          watchlistId: watchlistId || undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Gagal menambahkan ke watchlist');
      }
      setWatchlistSymbols((prev) => new Set([...prev, clean]));
      setWatchlistMessage({ text: `${clean} berhasil ditambahkan ke watchlist & radar`, type: 'success' });
      setNewWatchlistSymbol('');
      window.dispatchEvent(
        new CustomEvent('watchlist-updated', { detail: { action: 'add', symbol: clean, item: json.data } })
      );
      void loadRadar(date);
    } catch (err) {
      setWatchlistMessage({ text: err instanceof Error ? err.message : 'Gagal menambahkan', type: 'error' });
    } finally {
      setAddingWatchlist(false);
    }
  };

  const handleRemoveWatchlist = async (symbolToRemove: string) => {
    const clean = symbolToRemove.trim().toUpperCase();
    if (!confirm(`Hapus ${clean} dari watchlist dan radar?`)) return;
    try {
      const queryParams = new URLSearchParams({ symbol: clean });
      if (watchlistId) queryParams.set('watchlistId', String(watchlistId));

      const res = await fetch(`/api/watchlist?${queryParams.toString()}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Gagal menghapus dari watchlist');
      }
      setWatchlistSymbols((prev) => {
        const next = new Set(prev);
        next.delete(clean);
        return next;
      });
      setItems((prev) => prev.filter((i) => i.emiten !== clean));
      if (selectedEmiten?.emiten === clean) {
        setSelectedEmiten(null);
      }
      window.dispatchEvent(
        new CustomEvent('watchlist-updated', { detail: { action: 'delete', symbol: clean } })
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus dari watchlist');
    }
  };

  const strongAccumCount = items.filter((i) => (i.score ?? 0) >= 65).length;
  const heavyDistCount = items.filter((i) => (i.score ?? 0) <= 35).length;
  const extremeConcentrationCount = items.filter((i) => Boolean(i.concentration?.isExtremeConcentration)).length;
  const silentAccumCount = items.filter((i) => Boolean(i.volumeAnomaly?.isSilentAccumulation)).length;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', maxWidth: '100%' }}>
          {/* Quick Add Emiten to Watchlist & Radar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleAddWatchlist(newWatchlistSymbol);
            }}
            style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%' }}
          >
            <input
              type="text"
              placeholder="+ Emiten (e.g. BBCA)..."
              value={newWatchlistSymbol}
              maxLength={4}
              onChange={(e) => setNewWatchlistSymbol(e.target.value.toUpperCase())}
              disabled={addingWatchlist}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '8px',
                padding: '0.4rem 0.6rem',
                fontSize: '0.82rem',
                width: '135px',
                maxWidth: '100%',
                textTransform: 'uppercase',
              }}
            />
            <button
              type="submit"
              disabled={addingWatchlist || newWatchlistSymbol.trim().length !== 4}
              style={{
                background: 'rgba(56, 239, 125, 0.15)',
                border: '1px solid #38ef7d',
                color: '#38ef7d',
                borderRadius: '8px',
                padding: '0.4rem 0.65rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: addingWatchlist || newWatchlistSymbol.trim().length !== 4 ? 'not-allowed' : 'pointer',
                opacity: addingWatchlist || newWatchlistSymbol.trim().length !== 4 ? 0.5 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {addingWatchlist ? '...' : '+ Watchlist'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', maxWidth: '100%' }}>
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
      </div>

      {watchlistMessage && (
        <div
          style={{
            padding: '0.5rem 0.8rem',
            marginBottom: '1rem',
            borderRadius: '8px',
            fontSize: '0.8rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: watchlistMessage.type === 'success' ? 'rgba(56, 239, 125, 0.1)' : 'rgba(245, 87, 108, 0.1)',
            border: `1px solid ${watchlistMessage.type === 'success' ? '#38ef7d' : 'var(--accent-warning)'}`,
            color: watchlistMessage.type === 'success' ? '#38ef7d' : 'var(--accent-warning)',
          }}
        >
          <span>{watchlistMessage.text}</span>
          <button
            onClick={() => setWatchlistMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 4px' }}
          >
            ✕
          </button>
        </div>
      )}

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
              const netVal = s.totalNetInstitutionalValue ?? (s as any).netValue ?? 0;
              const isPositive = netVal >= 0;
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
                      {isPositive ? '+' : ''}{formatIDR(netVal)}
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

      {/* Phase 15: IDX Market Breadth & Composite Liquidity Engine (IHSG Pulse) */}
      {!loading && (
        <MarketBreadthCard />
      )}

      {/* Phase 13: Cross-Sector Capital Rotation & Institutional Flow Matrix */}
      {!loading && (
        <SectorRotationMatrixCard
          sectors={rotationSectors.length > 0 ? rotationSectors : undefined}
          asOfDate={date}
        />
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
                const verdict = (row.verdict || 'NEUTRAL') as RadarVerdict;
                const colors = verdictColor(verdict);
                return (
                  <tr
                    key={row.emiten || (row as any).symbol}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      transition: 'background 0.15s',
                    }}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {row.emiten || (row as any).symbol}
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
                        {String(verdict).replace('_', ' ')}
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
                      <span style={{ fontWeight: (row.concentration?.top3NetValueRatio ?? 0) >= 0.6 ? 700 : 400 }}>
                        {((row.concentration?.top3NetValueRatio ?? 0) * 100).toFixed(1)}%
                      </span>
                      {row.concentration?.isExtremeConcentration && (
                        <span style={{ marginLeft: '0.3rem', color: '#667eea', fontSize: '0.72rem', fontWeight: 600 }}>
                          [EKSTREM]
                        </span>
                      )}
                    </td>
                    <td>
                      {(row.topBuyers || []).slice(0, 2).map((b) => (
                        <span key={b.code} style={{ marginRight: '0.35rem', whiteSpace: 'nowrap' }}>
                          <strong>{b.code}</strong> ({formatIDR(b.netValue)})
                        </span>
                      ))}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span>{(row.volumeAnomaly?.volumeRatioToSma50 ?? 1).toFixed(1)}x</span>
                      {row.volumeAnomaly?.isSilentAccumulation && (
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
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'center' }}>
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
                        {watchlistSymbols.has(row.emiten) ? (
                          <button
                            onClick={() => void handleRemoveWatchlist(row.emiten)}
                            title={`Hapus ${row.emiten} dari Watchlist & Radar`}
                            style={{
                              background: 'rgba(245, 87, 108, 0.1)',
                              border: '1px solid rgba(245, 87, 108, 0.25)',
                              color: 'var(--accent-warning)',
                              borderRadius: '6px',
                              padding: '0.2rem 0.45rem',
                              cursor: 'pointer',
                              fontSize: '0.72rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Hapus
                          </button>
                        ) : (
                          <button
                            onClick={() => void handleAddWatchlist(row.emiten)}
                            title={`Tambah ${row.emiten} ke Watchlist`}
                            style={{
                              background: 'rgba(56, 239, 125, 0.1)',
                              border: '1px solid rgba(56, 239, 125, 0.25)',
                              color: '#38ef7d',
                              borderRadius: '6px',
                              padding: '0.2rem 0.45rem',
                              cursor: 'pointer',
                              fontSize: '0.72rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            + WL
                          </button>
                        )}
                      </div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {watchlistSymbols.has(selectedEmiten.emiten) ? (
                  <button
                    onClick={() => void handleRemoveWatchlist(selectedEmiten.emiten)}
                    style={{
                      background: 'rgba(245, 87, 108, 0.12)',
                      border: '1px solid rgba(245, 87, 108, 0.3)',
                      color: 'var(--accent-warning)',
                      borderRadius: '6px',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Hapus Watchlist
                  </button>
                ) : (
                  <button
                    onClick={() => void handleAddWatchlist(selectedEmiten.emiten)}
                    style={{
                      background: 'rgba(56, 239, 125, 0.15)',
                      border: '1px solid #38ef7d',
                      color: '#38ef7d',
                      borderRadius: '6px',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Tambah Watchlist
                  </button>
                )}
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

            {/* Wyckoff Structural Analysis & VSA Section */}
            {wyckoffLoading && (
              <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                Memuat analisis struktur Wyckoff &amp; VSA...
              </div>
            )}
            {!wyckoffLoading && wyckoffAssessment && (
              <WyckoffSchematicCard assessment={wyckoffAssessment} />
            )}

            {/* Volume Profile & Liquidity Distribution Section */}
            {volumeProfileLoading && (
              <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                Memuat Volume Profile &amp; Likuiditas Konsensus...
              </div>
            )}
            {!volumeProfileLoading && volumeProfile && (
              <VolumeProfileCard profile={volumeProfile} confluence={volumeProfileConfluence} />
            )}

            {/* Volatility Contraction Pattern (VCP) & Trend Template Section */}
            {vcpLoading && (
              <div style={{ marginTop: '1rem', padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
                Memuat Pola VCP &amp; Minervini Trend Template...
              </div>
            )}
            {!vcpLoading && vcpAssessment && (
              <VcpPatternCard assessment={vcpAssessment} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
