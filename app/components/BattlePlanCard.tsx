'use client';

import React, { useEffect, useState } from 'react';
import { PositionSizerModal } from './PositionSizerModal';

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
}

export interface MacroOverlayState {
  regime: 'MACRO_HEADWIND' | 'MACRO_NEUTRAL' | 'MACRO_TAILWIND';
  tightenInvalidationFactor: number;
  volumeMultiplier: number;
  summary: string;
}

export function BattlePlanCard({ date }: { date: string }) {
  const [plans, setPlans] = useState<BattlePlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isTradingDay, setIsTradingDay] = useState(true);
  const [macroOverlay, setMacroOverlay] = useState<MacroOverlayState | null>(null);
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
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-xs text-gray-400">
        <span className="font-semibold text-amber-400">📅 Libur Bursa / Akhir Pekan:</span> Battle Plan 08:30 WIB dinonaktifkan (Fail-Closed No-Op).
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/40 p-4 text-xs text-gray-400">
        Memuat 08:30 WIB Tactical Battle Plan...
      </div>
    );
  }

  if (plans.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 rounded-xl border border-emerald-900/50 bg-gradient-to-r from-gray-900 via-gray-900 to-emerald-950/30 p-5 shadow-lg">
      <div className="flex flex-col gap-2 border-b border-gray-800/80 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-sm font-bold tracking-wide text-white uppercase">
              08:30 WIB Tactical Battle Plan
            </h2>
            <span className="rounded bg-emerald-950 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-800">
              V15m Volume Confirmation Active
            </span>
            {macroOverlay?.regime === 'MACRO_HEADWIND' && (
              <span className="rounded bg-amber-950 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-800">
                ⚠️ Macro Headwind
              </span>
            )}
            {macroOverlay?.regime === 'MACRO_TAILWIND' && (
              <span className="rounded bg-teal-950 px-2 py-0.5 text-[10px] font-bold text-teal-300 border border-teal-800">
                🌊 Macro Tailwind
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-gray-400">
            Setup terkurasi sebelum bel pembukaan bursa. Konfirmasi partisipasi volume 15 menit pertama (09:00–09:15 WIB).
          </p>
        </div>
      </div>

      {/* Macro Overlay Advisory Banner */}
      {macroOverlay && macroOverlay.regime !== 'MACRO_NEUTRAL' && (
        <div className={`mt-3 rounded-lg border p-3 text-xs ${
          macroOverlay.regime === 'MACRO_HEADWIND'
            ? 'border-amber-800/60 bg-amber-950/20 text-amber-300'
            : 'border-teal-800/60 bg-teal-950/20 text-teal-300'
        }`}>
          <div className="font-semibold">
            {macroOverlay.regime === 'MACRO_HEADWIND' ? '⚠️ Peringatan Tekanan Makro (USD/IDR & Suku Bunga):' : '🌊 Sentimen Makro Positif:'}
          </div>
          <div className="mt-0.5 text-[11px] text-gray-300">
            {macroOverlay.summary}
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => {
          const effectiveInvalidation = p.adjusted_invalidation_price || p.invalidation_price;
          const effectiveV15m = p.adjusted_v15m_shares || p.open_15m_vol_threshold;

          return (
            <div
              key={p.emiten}
              className="flex flex-col justify-between rounded-lg border border-gray-800 bg-gray-800/40 p-3.5 transition hover:border-emerald-600/50"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-white">{p.emiten}</span>
                  <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs font-bold text-emerald-400">
                    {p.stance}
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">Trigger:</span>{' '}
                    <span className="font-semibold text-white">Rp {Number(p.trigger_price).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Stop:</span>{' '}
                    <span className="font-semibold text-rose-400">Rp {Number(effectiveInvalidation).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Target R1:</span>{' '}
                    <span className="font-semibold text-emerald-400">Rp {Number(p.target_r1).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Target Max:</span>{' '}
                    <span className="font-semibold text-emerald-300">Rp {Number(p.target_max).toLocaleString()}</span>
                  </div>
                </div>

                <div className="mt-2.5 rounded bg-gray-900/80 p-2 text-[11px] text-gray-300">
                  <span className="text-amber-400 font-medium">V15m Threshold:</span>{' '}
                  {Number(effectiveV15m).toLocaleString()} shares ({Math.round(Number(effectiveV15m) / 100).toLocaleString()} lot)
                  {p.adjusted_v15m_shares && p.adjusted_v15m_shares > p.open_15m_vol_threshold && (
                    <span className="ml-1 text-[10px] text-amber-400 font-semibold">(+Macro Buffer)</span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setSelectedPlan(p)}
                className="mt-3 w-full rounded bg-emerald-600/80 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-500"
              >
                Hitung Lot & Tranche
              </button>
            </div>
          );
        })}
      </div>

      {selectedPlan && (
        <PositionSizerModal
          isOpen={true}
          onClose={() => setSelectedPlan(null)}
          emiten={selectedPlan.emiten}
          plannedEntry={Number(selectedPlan.trigger_price)}
          invalidationStop={Number(selectedPlan.adjusted_invalidation_price || selectedPlan.invalidation_price)}
          targetR1={Number(selectedPlan.target_r1)}
          targetMax={Number(selectedPlan.target_max)}
        />
      )}
    </div>
  );
}
