'use client';

import React, { useEffect, useState } from 'react';
import { PositionSizerModal } from './PositionSizerModal';
import { WyckoffBadge } from './WyckoffBadge';
import type { WyckoffPhase } from '@/lib/wyckoff/types';

export interface BattlePlanItem {
  id: number;
  plan_date: string;
  emiten: string;
  stance: string;
  trigger_price: number;
  target_r1: number;
  target_max: number;
  invalidation_price: number;
  open_15m_vol_threshold: number;
  macro_bias: string;
  catalyst_summary?: string;
  macro_regime?: string;
  adjusted_invalidation_price?: number;
  adjusted_v15m_shares?: number;
  wyckoff_phase?: string | null;
  wyckoff_readiness?: number | null;
  poc_price?: number | null;
  vah_price?: number | null;
  val_price?: number | null;
  sector?: string | null;
  sector_quadrant?: string | null;
  vcp_stage?: string | null;
  vcp_pivot?: number | null;
  vcp_risk_pct?: number | null;
}

export interface MacroOverlayState {
  regime: 'MACRO_HEADWIND' | 'MACRO_NEUTRAL' | 'MACRO_TAILWIND';
  tightenInvalidationFactor: number;
  volumeMultiplier: number;
  summary: string;
}

export interface MarketBreadthSummary {
  regime: string;
  score: number;
  adRatio: number;
  advisory?: string;
}

const regimeBadgeClass: Record<string, string> = {
  MACRO_HEADWIND: 'battle-plan-badge--headwind',
  MACRO_TAILWIND: 'battle-plan-badge--tailwind',
};

export function BattlePlanCard({ date }: { date: string }) {
  const [plans, setPlans] = useState<BattlePlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isTradingDay, setIsTradingDay] = useState(true);
  const [macroOverlay, setMacroOverlay] = useState<MacroOverlayState | null>(null);
  const [marketBreadth, setMarketBreadth] = useState<MarketBreadthSummary | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<BattlePlanItem | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchPlan() {
      setLoading(true);
      try {
        const res = await fetch(`/api/desk/battle-plan?date=${encodeURIComponent(date)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success') {
          setPlans(json.items || []);
          setIsTradingDay(json.isTradingDay ?? true);
          if (json.macroOverlay) {
            setMacroOverlay(json.macroOverlay);
          }
          if (json.marketBreadth) {
            setMarketBreadth(json.marketBreadth);
          }
        }
      } catch (err) {
        console.error('Failed to load battle plan:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    void fetchPlan();
    return () => {
      isMounted = false;
    };
  }, [date]);

  if (!isTradingDay) {
    return (
      <div className="battle-plan">
        <span className="battle-plan-title">Libur Bursa / Akhir Pekan:</span>{' '}
        <span className="battle-plan-subtitle">
          Battle Plan 08:30 WIB dinonaktifkan (Fail-Closed No-Op).
        </span>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="battle-plan">
        <p className="battle-plan-subtitle">Memuat 08:30 WIB Tactical Battle Plan…</p>
      </div>
    );
  }

  if (plans.length === 0) {
    return null;
  }

  const regime = macroOverlay?.regime;
  const alertClass =
    regime === 'MACRO_HEADWIND' ? 'battle-plan-alert--headwind' : 'battle-plan-alert--tailwind';

  return (
    <div className="battle-plan">
      <div className="battle-plan-header">
        <div>
          <div className="battle-plan-title-row">
            <span className="battle-plan-pulse" aria-hidden="true" />
            <h2 className="battle-plan-title">08:30 WIB Tactical Battle Plan</h2>
            <span className="battle-plan-badge battle-plan-badge--volume">
              V15m Volume Confirmation Active
            </span>
            {regime && regime !== 'MACRO_NEUTRAL' && (
              <span className={`battle-plan-badge ${regimeBadgeClass[regime]}`}>
                {regime === 'MACRO_HEADWIND' ? '⚠️ Macro Headwind' : '🌊 Macro Tailwind'}
              </span>
            )}
            {marketBreadth && (
              <span
                className="battle-plan-badge"
                style={{
                  background:
                    marketBreadth.score >= 60
                      ? 'rgba(56, 239, 125, 0.12)'
                      : marketBreadth.score <= 40
                        ? 'rgba(244, 63, 94, 0.12)'
                        : 'rgba(251, 191, 36, 0.12)',
                  color:
                    marketBreadth.score >= 60
                      ? '#38ef7d'
                      : marketBreadth.score <= 40
                        ? '#f43f5e'
                        : '#fbbf24',
                  border: `1px solid ${
                    marketBreadth.score >= 60
                      ? 'rgba(56, 239, 125, 0.3)'
                      : marketBreadth.score <= 40
                        ? 'rgba(244, 63, 94, 0.3)'
                        : 'rgba(251, 191, 36, 0.3)'
                  }`,
                }}
                title={marketBreadth.advisory || `IHSG Pulse: ${marketBreadth.regime} (A/D: ${marketBreadth.adRatio}x)`}
              >
                📊 Breadth: {marketBreadth.regime.replace(/_/g, ' ')} ({marketBreadth.score}/100)
              </span>
            )}
          </div>
          <p className="battle-plan-subtitle">
            Setup terkurasi sebelum bel pembukaan bursa. Konfirmasi partisipasi volume 15 menit
            pertama (09:00–09:15 WIB).
          </p>
        </div>
      </div>

      {macroOverlay && regime && regime !== 'MACRO_NEUTRAL' && (
        <div className={`battle-plan-alert ${alertClass}`}>
          <strong>
            {regime === 'MACRO_HEADWIND'
              ? '⚠️ Peringatan Tekanan Makro (USD/IDR & Suku Bunga):'
              : '🌊 Sentimen Makro Positif:'}
          </strong>
          <span>{macroOverlay.summary}</span>
        </div>
      )}

      <div className="battle-plan-grid">
        {plans.map((p) => {
          const effectiveInvalidation = p.adjusted_invalidation_price || p.invalidation_price;
          const effectiveV15m = p.adjusted_v15m_shares || p.open_15m_vol_threshold;
          const buffered =
            !!p.adjusted_v15m_shares && p.adjusted_v15m_shares > p.open_15m_vol_threshold;

          return (
            <article key={p.emiten} className="battle-plan-card">
              <div>
                <div className="battle-plan-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span className="battle-plan-emiten">{p.emiten}</span>
                    {p.wyckoff_phase && (
                      <WyckoffBadge
                        phase={p.wyckoff_phase as WyckoffPhase}
                        confidenceScore={p.wyckoff_readiness ?? undefined}
                      />
                    )}
                    {p.poc_price && (
                      <span className="vp-badge vp-badge--poc" title="Volume Profile Point of Control">
                        POC: Rp {Number(p.poc_price).toLocaleString('id-ID')}
                      </span>
                    )}
                    {p.sector && (
                      <span
                        className={`sec-badge ${
                          p.sector_quadrant === 'LEADING'
                            ? 'sec-badge--leading'
                            : p.sector_quadrant === 'IMPROVING'
                              ? 'sec-badge--improving'
                              : p.sector_quadrant === 'WEAKENING'
                                ? 'sec-badge--weakening'
                                : p.sector_quadrant === 'LAGGING'
                                  ? 'sec-badge--lagging'
                                  : 'sec-badge--leading'
                        }`}
                        title={`Sektor: ${p.sector} (${p.sector_quadrant || 'ROTATION'})`}
                      >
                        {p.sector_quadrant === 'LEADING' ? '🌊 ' : p.sector_quadrant === 'LAGGING' ? '⚠️ ' : ''}
                        {p.sector}
                      </span>
                    )}
                    {p.vcp_pivot && (
                      <span
                        className="vcp-badge"
                        title={`VCP ${p.vcp_stage || 'Setup'} (Pivot: Rp ${Number(p.vcp_pivot).toLocaleString('id-ID')}${p.vcp_risk_pct ? `, Resiko: ${p.vcp_risk_pct}%` : ''})`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '6px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          background: p.vcp_stage === 'PIVOT_READY' ? 'rgba(56, 239, 125, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                          color: p.vcp_stage === 'PIVOT_READY' ? '#38ef7d' : '#a5b4fc',
                          border: p.vcp_stage === 'PIVOT_READY' ? '1px solid rgba(56, 239, 125, 0.3)' : '1px solid rgba(99, 102, 241, 0.3)',
                        }}
                      >
                        🎯 VCP: Rp {Number(p.vcp_pivot).toLocaleString('id-ID')}
                      </span>
                    )}
                  </div>
                  <span className="battle-plan-stance">{p.stance}</span>
                </div>

                <div className="battle-plan-levels">
                  <div className="battle-plan-level">
                    <span>Trigger</span>
                    <strong>Rp {Number(p.trigger_price).toLocaleString('id-ID')}</strong>
                  </div>
                  <div className="battle-plan-level battle-plan-level--stop">
                    <span>Stop</span>
                    <strong>Rp {Number(effectiveInvalidation).toLocaleString('id-ID')}</strong>
                  </div>
                  <div className="battle-plan-level battle-plan-level--target">
                    <span>Target R1</span>
                    <strong>Rp {Number(p.target_r1).toLocaleString('id-ID')}</strong>
                  </div>
                  <div className="battle-plan-level battle-plan-level--target-max">
                    <span>Target Max</span>
                    <strong>Rp {Number(p.target_max).toLocaleString('id-ID')}</strong>
                  </div>
                </div>

                <p className="battle-plan-volume">
                  <strong>V15m Threshold:</strong>{' '}
                  {Number(effectiveV15m).toLocaleString('id-ID')} shares (
                  {Math.round(Number(effectiveV15m) / 100).toLocaleString('id-ID')} lot)
                  {buffered && <span className="battle-plan-buffer"> (+Macro Buffer)</span>}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPlan(p)}
                className="battle-plan-action"
              >
                Hitung Lot &amp; Tranche
              </button>
            </article>
          );
        })}
      </div>

      {selectedPlan && (
        <PositionSizerModal
          isOpen
          onClose={() => setSelectedPlan(null)}
          emiten={selectedPlan.emiten}
          plannedEntry={Number(selectedPlan.trigger_price)}
          invalidationStop={Number(
            selectedPlan.adjusted_invalidation_price || selectedPlan.invalidation_price
          )}
          targetR1={Number(selectedPlan.target_r1)}
          targetMax={Number(selectedPlan.target_max)}
        />
      )}
    </div>
  );
}