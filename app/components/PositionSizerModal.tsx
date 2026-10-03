'use client';

import React, { useState, useId } from 'react';
import { calculatePositionSize } from '@/lib/risk/sizer';
import { calculateTrancheSchedule } from '@/lib/risk/tranche-sizer';

export interface PositionSizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  emiten: string;
  plannedEntry: number;
  invalidationStop: number;
  targetR1?: number;
  targetMax?: number;
  adtvShares?: number;
  onLogExecution?: (data: {
    lots: number;
    executedPrice: number;
    tranches?: unknown[];
  }) => void;
}

export function PositionSizerModal({
  isOpen,
  onClose,
  emiten,
  plannedEntry,
  invalidationStop,
  targetR1,
  targetMax,
  adtvShares,
  onLogExecution,
}: PositionSizerModalProps) {
  const [accountEquity, setAccountEquity] = useState<number>(100_000_000);
  const [riskPercentage, setRiskPercentage] = useState<number>(1.0);
  const [executedPrice, setExecutedPrice] = useState<number>(plannedEntry);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [logSuccess, setLogSuccess] = useState<boolean>(false);
  const [showTranches, setShowTranches] = useState<boolean>(false);
  const equityInputId = useId();
  const riskInputId = useId();
  const executedPriceInputId = useId();

  if (!isOpen) return null;

  const sizerResult = calculatePositionSize({
    accountEquity,
    riskPercentage,
    plannedEntry: executedPrice || plannedEntry,
    invalidationStop,
    buyFeePct: 0.15,
    sellFeePct: 0.25,
    maxCapitalPct: 20.0,
  });

  const trancheSchedule = calculateTrancheSchedule({
    totalLots: sizerResult.recommendedLots,
    entryPrice: executedPrice || plannedEntry,
    adtvShares: adtvShares || 10_000_000,
    avgQueueDepthLots: 2000,
  });

  const handleLog = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        lots: sizerResult.recommendedLots,
        executedPrice,
        tranches: trancheSchedule.tranches,
      };
      if (onLogExecution) {
        onLogExecution(payload);
      } else {
        await fetch('/api/desk/execution-audit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            emiten,
            plannedEntry,
            executedEntry: executedPrice,
            plannedR1: targetR1,
            invalidationStop,
            lots: sizerResult.recommendedLots,
            tranches: trancheSchedule.tranches,
          }),
        });
      }
      setLogSuccess(true);
      setTimeout(() => {
        setLogSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Failed to log execution audit:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sizer-overlay">
      <div
        className="sizer-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`IDX Dynamic Sizer: ${emiten}`}
      >
        <div className="sizer-modal-header">
          <div>
            <h2 className="sizer-modal-title">IDX Dynamic Sizer: {emiten}</h2>
            <p className="sizer-modal-subtitle">
              Friction-adjusted risk management (1 Lot = 100 shares)
            </p>
          </div>
          <button type="button" onClick={onClose} className="sizer-modal-close" aria-label="Tutup">
            ✕
          </button>
        </div>

        <div className="sizer-grid-2">
          <div className="sizer-field">
            <label htmlFor={equityInputId}>Account Equity (IDR)</label>
            <input
              id={equityInputId}
              type="number"
              value={accountEquity}
              onChange={(e) => setAccountEquity(Number(e.target.value))}
            />
          </div>
          <div className="sizer-field">
            <label htmlFor={riskInputId}>Max Risk per Trade (%)</label>
            <input
              id={riskInputId}
              type="number"
              step="0.1"
              value={riskPercentage}
              onChange={(e) => setRiskPercentage(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="sizer-grid-4" style={{ marginTop: '1rem' }}>
          <div className="sizer-ref">
            <span>Planned Entry</span>
            <strong>Rp {plannedEntry.toLocaleString('id-ID')}</strong>
          </div>
          <div className="sizer-ref sizer-ref--stop">
            <span>Stop Loss</span>
            <strong>Rp {invalidationStop.toLocaleString('id-ID')}</strong>
          </div>
          <div className="sizer-ref sizer-ref--target">
            <span>Target R1</span>
            <strong>{targetR1 ? `Rp ${targetR1.toLocaleString('id-ID')}` : '—'}</strong>
          </div>
          <div className="sizer-ref sizer-ref--target-max">
            <span>Target Max</span>
            <strong>{targetMax ? `Rp ${targetMax.toLocaleString('id-ID')}` : '—'}</strong>
          </div>
        </div>

        <div className="sizer-field" style={{ marginTop: '1rem' }}>
          <label htmlFor={executedPriceInputId}>Actual Executed Fill Price (IDR)</label>
          <input
            id={executedPriceInputId}
            type="number"
            value={executedPrice}
            onChange={(e) => setExecutedPrice(Number(e.target.value))}
          />
        </div>

        <div className="sizer-result" style={{ marginTop: '1rem' }}>
          <div className="sizer-result-head">
            <span>Recommended Position</span>
            <strong>
              {sizerResult.recommendedLots.toLocaleString('id-ID')} Lots
            </strong>
          </div>
          <div className="sizer-result-grid">
            <div>
              Allocated Capital{' '}
              <strong>Rp {sizerResult.allocatedCapital.toLocaleString('id-ID')}</strong>
            </div>
            <div>
              Total Risk at Stop{' '}
              <strong className="is-risk">
                Rp {sizerResult.totalRiskAtStop.toLocaleString('id-ID')}
              </strong>
            </div>
          </div>
          {sizerResult.capitalCapReached && (
            <p className="sizer-cap-note">
              ⚠️ Capped by 20% portfolio exposure limit.
            </p>
          )}
        </div>

        {sizerResult.recommendedLots >= 100 && (
          <div className="tranche-panel" style={{ marginTop: '1rem' }}>
            <div className="tranche-panel-head">
              <span className="tranche-panel-title">
                📦 Tranche Breakdown ({trancheSchedule.tranches.length} Tranches)
              </span>
              <button
                type="button"
                onClick={() => setShowTranches(!showTranches)}
                className="tranche-toggle"
                aria-expanded={showTranches}
              >
                {showTranches ? 'Sembunyikan' : 'Lihat Jadwal Tranche'}
              </button>
            </div>

            {showTranches && (
              <>
                <p className="tranche-hint">
                  Eksekusi bertahap untuk meminimalkan market impact slippage:
                </p>
                {trancheSchedule.tranches.map((t) => (
                  <div key={t.trancheNumber} className="tranche-row">
                    <div>
                      <strong>{t.name}</strong>
                      <small>{t.targetSession}</small>
                    </div>
                    <figure>
                      <b>
                        {t.lotSize.toLocaleString('id-ID')} Lots ({t.percentage}%)
                      </b>
                      <small>Slippage est: ~{t.estimatedSlippageTicks} tick</small>
                    </figure>
                  </div>
                ))}
                {trancheSchedule.marketImpactAlert === 'HIGH_MARKET_IMPACT' && (
                  <p className="tranche-impact-note">
                    ⚠️ Order besar terhadap kedalaman antrean. Disarankan menggunakan algoritma
                    TWAP/VWAP.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div className="sizer-modal-footer">
          <button type="button" onClick={onClose} className="sizer-btn">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLog}
            disabled={isSubmitting || !sizerResult.isValid || sizerResult.recommendedLots === 0}
            className="sizer-btn sizer-btn--primary"
          >
            {logSuccess
              ? '✓ Execution Logged!'
              : isSubmitting
                ? 'Logging…'
                : 'Confirm & Log Fill'}
          </button>
        </div>
      </div>
    </div>
  );
}