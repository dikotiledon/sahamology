'use client';

import React, { useState } from 'react';
import type {
  TradeDisciplineReview,
  TraderTiltStatus,
  PsychologicalState,
} from '@/lib/cognitive';

export interface CognitiveJournalCardProps {
  emiten?: string;
  initialTilt?: TraderTiltStatus;
  latestReview?: TradeDisciplineReview;
  onReviewSaved?: (review: TradeDisciplineReview, tilt: TraderTiltStatus) => void;
  defaultPlannedEntry?: number;
  defaultPlannedStop?: number;
  defaultTargetR1?: number;
  defaultPlannedLots?: number;
}

export function CognitiveJournalCard({
  emiten = 'BBRI',
  initialTilt,
  latestReview: propLatestReview,
  onReviewSaved,
  defaultPlannedEntry = 5000,
  defaultPlannedStop = 4850,
  defaultTargetR1 = 5300,
  defaultPlannedLots = 100,
}: CognitiveJournalCardProps) {
  const [tilt, setTilt] = useState<TraderTiltStatus>(
    initialTilt || {
      psychologicalCapitalPct: 100,
      consecutiveViolations: 0,
      tiltState: 'NORMAL',
      advisory: 'Optimal psychological state. Full playbook compliance active with standard risk allocations.',
      lockoutRecommended: false,
    }
  );

  const [review, setReview] = useState<TradeDisciplineReview | undefined>(propLatestReview);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form states
  const [plannedEntry, setPlannedEntry] = useState(defaultPlannedEntry);
  const [executedEntry, setExecutedEntry] = useState(defaultPlannedEntry);
  const [plannedStop, setPlannedStop] = useState(defaultPlannedStop);
  const [executedExit, setExecutedExit] = useState<string>('');
  const [targetR1, setTargetR1] = useState(defaultTargetR1);
  const [plannedLots, setPlannedLots] = useState(defaultPlannedLots);
  const [executedLots, setExecutedLots] = useState(defaultPlannedLots);
  const [psychologicalState, setPsychologicalState] = useState<PsychologicalState>('CALM');
  const [minutesSinceStopOut, setMinutesSinceStopOut] = useState<string>('');
  const [reflection, setReflection] = useState('');

  const tiltBannerClass =
    tilt.tiltState === 'TILT_LOCKOUT'
      ? 'cog-tilt-banner--lockout'
      : tilt.tiltState === 'CAUTION'
        ? 'cog-tilt-banner--caution'
        : 'cog-tilt-banner--normal';

  const progressFillColor =
    tilt.psychologicalCapitalPct < 40
      ? '#ef4444'
      : tilt.psychologicalCapitalPct < 70
        ? '#f59e0b'
        : '#10b981';

  async function handleAuditSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/desk/cognitive-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emiten,
          plannedEntry: Number(plannedEntry),
          realizedEntry: Number(executedEntry),
          plannedStop: Number(plannedStop),
          realizedExit: executedExit !== '' ? Number(executedExit) : undefined,
          targetR1: Number(targetR1),
          plannedLots: Number(plannedLots),
          realizedLots: Number(executedLots),
          psychologicalStateAtEntry: psychologicalState,
          minutesSincePreviousStopOut:
            minutesSinceStopOut !== '' ? Number(minutesSinceStopOut) : undefined,
          traderReflection: reflection || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.status !== 'success') {
        throw new Error(data.error || 'Failed to submit cognitive audit');
      }

      setReview(data.review);
      if (data.tilt) {
        setTilt(data.tilt);
      }
      if (onReviewSaved) {
        onReviewSaved(data.review, data.tilt);
      }
      setIsFormOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting review';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  function getGradeBadgeClass(grade?: string): string {
    switch (grade) {
      case 'MASTER_DISCIPLINE':
        return 'cog-badge--master';
      case 'ACCEPTABLE_EXECUTION':
        return 'cog-badge--acceptable';
      case 'SLIPPY_DISCIPLINE':
        return 'cog-badge--slippy';
      case 'UNGOVERNED_EXECUTION':
        return 'cog-badge--ungoverned';
      default:
        return 'cog-badge--master';
    }
  }

  return (
    <div className="cog-card">
      <div className="cog-header">
        <div>
          <div className="cog-title-row">
            <h4 className="cog-title">Jurnal Kognitif &amp; Audit Disiplin Eksekusi: {emiten}</h4>
            {review && (
              <span className={`cog-badge ${getGradeBadgeClass(review.grade)}`}>
                {review.grade.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <p className="cog-subtitle">
            Pelacakan deviasi psikologis (FOMO Chasing, Revenge Trade, Moving Stop Loss) &amp; Trader Tilt.
          </p>
        </div>

        <button
          type="button"
          className="cog-btn"
          onClick={() => setIsFormOpen(!isFormOpen)}
          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
        >
          {isFormOpen ? 'Tutup Formulir' : '+ Audit Eksekusi Trade'}
        </button>
      </div>

      {/* Tilt State Banner & Psychological Capital Progress */}
      <div className={`cog-tilt-banner ${tiltBannerClass}`}>
        <div className="cog-tilt-header">
          <span>
            {tilt.tiltState === 'TILT_LOCKOUT'
              ? '🚨 TILT LOCKOUT ADVISORY'
              : tilt.tiltState === 'CAUTION'
                ? '⚠️ CAUTION STATE'
                : '🛡️ PSYCHOLOGICAL CAPITAL'}
          </span>
          <span>{tilt.psychologicalCapitalPct}% Modal Psikologis</span>
        </div>
        <div className="cog-tilt-progress-track">
          <div
            className="cog-tilt-progress-fill"
            style={{
              width: `${Math.min(100, Math.max(0, tilt.psychologicalCapitalPct))}%`,
              background: progressFillColor,
            }}
          />
        </div>
        <div style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>{tilt.advisory}</div>
      </div>

      {/* Interactive Execution Form */}
      {isFormOpen && (
        <form className="cog-form" onSubmit={handleAuditSubmit}>
          <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
            Audit Parameter Trade Realized vs Planned ({emiten})
          </div>

          {errorMsg && (
            <div style={{ color: '#f87171', fontSize: '0.72rem' }}>{errorMsg}</div>
          )}

          <div className="cog-form-grid">
            <div className="cog-form-field">
              <label>Planned Entry (Rp)</label>
              <input
                type="number"
                className="cog-form-input"
                value={plannedEntry}
                onChange={(e) => setPlannedEntry(Number(e.target.value))}
                required
              />
            </div>
            <div className="cog-form-field">
              <label>Realized Entry (Rp)</label>
              <input
                type="number"
                className="cog-form-input"
                value={executedEntry}
                onChange={(e) => setExecutedEntry(Number(e.target.value))}
                required
              />
            </div>
            <div className="cog-form-field">
              <label>Planned Invalidation Stop (Rp)</label>
              <input
                type="number"
                className="cog-form-input"
                value={plannedStop}
                onChange={(e) => setPlannedStop(Number(e.target.value))}
                required
              />
            </div>
            <div className="cog-form-field">
              <label>Target R1 (Rp)</label>
              <input
                type="number"
                className="cog-form-input"
                value={targetR1}
                onChange={(e) => setTargetR1(Number(e.target.value))}
                required
              />
            </div>
            <div className="cog-form-field">
              <label>Realized Exit (Rp - Optional)</label>
              <input
                type="number"
                className="cog-form-input"
                placeholder="Exit Price"
                value={executedExit}
                onChange={(e) => setExecutedExit(e.target.value)}
              />
            </div>
            <div className="cog-form-field">
              <label>Planned Lots</label>
              <input
                type="number"
                className="cog-form-input"
                value={plannedLots}
                onChange={(e) => setPlannedLots(Number(e.target.value))}
                required
              />
            </div>
            <div className="cog-form-field">
              <label>Realized Lots</label>
              <input
                type="number"
                className="cog-form-input"
                value={executedLots}
                onChange={(e) => setExecutedLots(Number(e.target.value))}
                required
              />
            </div>
            <div className="cog-form-field">
              <label>Status Emosional Entry</label>
              <select
                className="cog-form-select"
                value={psychologicalState}
                onChange={(e) => setPsychologicalState(e.target.value as PsychologicalState)}
              >
                <option value="CALM">Tenang &amp; Sesuai Rencana (CALM)</option>
                <option value="EUPHORIC">Overconfident / Euphoric</option>
                <option value="ANXIOUS">Gelisah / Takut Ketinggalan (ANXIOUS)</option>
                <option value="FRUSTRATED">Frustrasi / Ingin Balas Dendam (FRUSTRATED)</option>
              </select>
            </div>
            <div className="cog-form-field">
              <label>Menit Sejak Stop-Out Terakhir</label>
              <input
                type="number"
                className="cog-form-input"
                placeholder="misal: 15 (jika ada)"
                value={minutesSinceStopOut}
                onChange={(e) => setMinutesSinceStopOut(e.target.value)}
              />
            </div>
          </div>

          <div className="cog-form-field">
            <label>Refleksi Trader / Catatan Mental</label>
            <textarea
              className="cog-form-textarea"
              rows={2}
              placeholder="Catatan psikologis: Apakah ada dorongan mengejar harga? Apakah cut loss dieksekusi tepat?"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
            />
          </div>

          <button type="submit" className="cog-btn" disabled={loading}>
            {loading ? 'Menghitung Disiplin...' : 'Simpan & Evaluasi Disiplin'}
          </button>
        </form>
      )}

      {/* Review Metrics Display */}
      {review && (
        <>
          <div className="cog-score-grid">
            <div className="cog-metric-box">
              <span>Skor Disiplin</span>
              <strong
                style={{
                  color:
                    review.disciplineScore >= 85
                      ? '#38ef7d'
                      : review.disciplineScore >= 70
                        ? '#22d3ee'
                        : review.disciplineScore >= 50
                          ? '#fbbf24'
                          : '#f43f5e',
                }}
              >
                {review.disciplineScore}/100
              </strong>
            </div>
            <div className="cog-metric-box">
              <span>Grade Kepatuhan</span>
              <strong style={{ fontSize: '0.82rem' }}>
                {review.grade.replace(/_/g, ' ')}
              </strong>
            </div>
            <div className="cog-metric-box">
              <span>Deviasi Emosional</span>
              <strong>{review.deviations.length} Terdeteksi</strong>
            </div>
            <div className="cog-metric-box">
              <span>State Psikologis</span>
              <strong>{review.psychologicalState}</strong>
            </div>
          </div>

          {review.deviations.length > 0 && (
            <div className="cog-deviations-list">
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Rincian Deviasi Eksekusi:
              </div>
              {review.deviations.map((dev, idx) => (
                <div key={idx} className="cog-deviation-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      className={`cog-deviation-tag ${
                        dev.severity === 'SEVERE'
                          ? 'cog-deviation-tag--severe'
                          : dev.severity === 'MODERATE'
                            ? 'cog-deviation-tag--moderate'
                            : 'cog-deviation-tag--mild'
                      }`}
                    >
                      {dev.type.replace(/_/g, ' ')}
                    </span>
                    <span>{dev.description}</span>
                  </div>
                  <strong style={{ color: '#f43f5e' }}>-{dev.penalty} pts</strong>
                </div>
              ))}
            </div>
          )}

          {review.traderReflection && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
                fontSize: '0.72rem',
                color: 'var(--text-secondary)',
              }}
            >
              <strong>Refleksi:</strong> {review.traderReflection}
            </div>
          )}
        </>
      )}

      <div className="cog-boundary-notice">
        <span>
          🛡️ Mandat Arsitektur: Jurnal Kognitif bertindak sebagai audit psikologi eksekusi &amp; refleksi
          pasca-trade; tidak mengubah evaluasi gerbang <strong>G0–G4</strong>. Sinyal beli tetap wajib
          lulus Playbook Trading Desk secara kuantitatif.
        </span>
      </div>
    </div>
  );
}
