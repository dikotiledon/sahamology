'use client';

import React, { useState, useId } from 'react';
import { calculatePositionSize } from '@/lib/risk/sizer';

export interface PositionSizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  emiten: string;
  plannedEntry: number;
  invalidationStop: number;
  targetR1?: number;
  targetMax?: number;
  onLogExecution?: (data: { lots: number; executedPrice: number }) => void;
}

export function PositionSizerModal({
  isOpen,
  onClose,
  emiten,
  plannedEntry,
  invalidationStop,
  targetR1,
  targetMax,
  onLogExecution,
}: PositionSizerModalProps) {
  const [accountEquity, setAccountEquity] = useState<number>(100_000_000);
  const [riskPercentage, setRiskPercentage] = useState<number>(1.0);
  const [executedPrice, setExecutedPrice] = useState<number>(plannedEntry);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [logSuccess, setLogSuccess] = useState<boolean>(false);
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

  const handleLog = async () => {
    setIsSubmitting(true);
    try {
      if (onLogExecution) {
        onLogExecution({ lots: sizerResult.recommendedLots, executedPrice });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl text-gray-100">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div>
            <h2 className="text-lg font-bold text-emerald-400">
              IDX Dynamic Sizer: {emiten}
            </h2>
            <p className="text-xs text-gray-400">
              Friction-adjusted risk management (1 Lot = 100 shares)
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={equityInputId} className="block text-xs text-gray-400">Account Equity (IDR)</label>
              <input
                id={equityInputId}
                type="number"
                value={accountEquity}
                onChange={(e) => setAccountEquity(Number(e.target.value))}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label htmlFor={riskInputId} className="block text-xs text-gray-400">Max Risk per Trade (%)</label>
              <input
                id={riskInputId}
                type="number"
                step="0.1"
                value={riskPercentage}
                onChange={(e) => setRiskPercentage(Number(e.target.value))}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-800/60 p-3 text-xs">
            <div>
              <span className="text-gray-400">Planned Entry:</span>
              <div className="font-semibold text-white">Rp {plannedEntry.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-gray-400">Stop Loss:</span>
              <div className="font-semibold text-rose-400">Rp {invalidationStop.toLocaleString()}</div>
            </div>
            <div>
              <span className="text-gray-400">Target R1:</span>
              <div className="font-semibold text-emerald-400">
                {targetR1 ? `Rp ${targetR1.toLocaleString()}` : '-'}
              </div>
            </div>
          </div>

          <div>
            <label htmlFor={executedPriceInputId} className="block text-xs text-gray-400">Actual Executed Fill Price (IDR)</label>
            <input
              id={executedPriceInputId}
              type="number"
              value={executedPrice}
              onChange={(e) => setExecutedPrice(Number(e.target.value))}
              className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-hidden"
            />
          </div>

          {/* Sizing Outcome Box */}
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">Recommended Position:</span>
              <span className="text-2xl font-black text-emerald-400">
                {sizerResult.recommendedLots} Lots
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-300">
              <div>
                <span>Allocated Capital: </span>
                <span className="font-semibold text-white">
                  Rp {sizerResult.allocatedCapital.toLocaleString()}
                </span>
              </div>
              <div>
                <span>Total Risk at Stop: </span>
                <span className="font-semibold text-rose-400">
                  Rp {sizerResult.totalRiskAtStop.toLocaleString()}
                </span>
              </div>
            </div>

            {sizerResult.capitalCapReached && (
              <div className="mt-2 text-xs text-amber-400 font-medium">
                ⚠️ Capped by 20% portfolio exposure limit.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end space-x-3 border-t border-gray-800 pt-3">
          <button
            onClick={onClose}
            className="rounded px-4 py-1.5 text-sm font-medium text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleLog}
            disabled={isSubmitting || !sizerResult.isValid || sizerResult.recommendedLots === 0}
            className="rounded bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {logSuccess ? '✓ Execution Logged!' : isSubmitting ? 'Logging...' : 'Confirm & Log Fill'}
          </button>
        </div>
      </div>
    </div>
  );
}
