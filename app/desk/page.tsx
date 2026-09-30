'use client';

import { useCallback, useEffect, useState } from 'react';
import MorningCard from '../components/MorningCard';
import RankedDeskTable from '../components/RankedDeskTable';
import type { DeskApiPayload } from '@/lib/desk/assemble';
import { sessionDateJakarta } from '@/lib/market-calendar';

function todayJakartaHint(): string {
  return sessionDateJakarta(new Date());
}

export default function DeskPage() {
  const [date, setDate] = useState(todayJakartaHint);
  const [payload, setPayload] = useState<DeskApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAvoid, setShowAvoid] = useState(false);

  const load = useCallback(async (asOf: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/desk?date=${encodeURIComponent(asOf)}`);
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error || 'Gagal memuat desk');
      }
      setPayload(json.data as DeskApiPayload);
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(date);
  }, [date, load]);

  useEffect(() => {
    if (!window.location.search.includes('qa=1')) return;
    const w = window as typeof window & {
      __setDeskPayload?: (data: DeskApiPayload) => void;
    };
    w.__setDeskPayload = (data) => {
      setLoading(false);
      setError(null);
      setPayload(data);
    };
    return () => {
      delete w.__setDeskPayload;
    };
  }, []);

  return (
    <div className="container" style={{ paddingTop: '2rem', paddingBottom: '2rem' }}>
      <div className="desk-header">
        <div>
          <h1 className="desk-title">Ranked Desk</h1>
          <p className="desk-subtitle">Kartu tersimpan, bukan evaluasi ulang. Phase 4 tetap capture-complete, bukan ship-complete.</p>
        </div>
        <label className="desk-date">
          Tanggal
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>

      {loading && <p className="desk-muted">Memuat jurnal…</p>}
      {error && (
        <div className="glass-card desk-error" style={{ background: 'rgba(245, 87, 108, 0.1)', borderColor: 'var(--accent-warning)' }}>
          <p style={{ color: 'var(--accent-warning)' }}>{error}</p>
        </div>
      )}
      {payload && (
        <>
          <MorningCard card={payload.morningCard} />
          {payload.morningCard.avoidCount > 0 && (
            <label className="desk-avoid-toggle">
              <input
                type="checkbox"
                checked={showAvoid}
                onChange={(event) => setShowAvoid(event.target.checked)}
              />
              Tampilkan AVOID ({payload.morningCard.avoidCount})
            </label>
          )}
          <RankedDeskTable rows={payload.deskRows} showAvoid={showAvoid} />
        </>
      )}
    </div>
  );
}
