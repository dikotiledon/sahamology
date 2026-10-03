'use client';

import React, { useEffect, useState } from 'react';
import type {
  CorporateActionAssessment,
  CorpActionRegime,
} from '@/lib/corporate-action/types';

export interface CorporateActionsCardProps {
  emiten: string;
  initialData?: CorporateActionAssessment | null;
  className?: string;
}

function getRegimeClass(regime: CorpActionRegime): string {
  switch (regime) {
    case 'PRE_CUM_RUNUP_EXPANSION':
      return 'corp-regime--runup';
    case 'POST_EX_ABSORPTION_BOUNCE':
      return 'corp-regime--bounce';
    case 'RIGHTS_ISSUE_STANDBY_SECURED':
      return 'corp-regime--standby';
    case 'DIVIDEND_TRAP_HAZARD':
      return 'corp-regime--trap';
    case 'UNSECURED_RIGHTS_DILUTION_RISK':
      return 'corp-regime--dilution';
    default:
      return 'corp-regime--neutral';
  }
}

function formatPrice(val?: number | null): string {
  if (val == null || isNaN(val)) return '-';
  return `Rp ${Math.round(val).toLocaleString('id-ID')}`;
}

export function CorporateActionsCard({
  emiten,
  initialData,
  className,
}: CorporateActionsCardProps) {
  const [data, setData] = useState<CorporateActionAssessment | null>(initialData || null);
  const [loading, setLoading] = useState<boolean>(!initialData);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchCorpAction() {
      setLoading(true);
      try {
        const res = await fetch(`/api/radar/corporate-actions?emiten=${encodeURIComponent(emiten)}`);
        const json = await res.json();
        if (isMounted && json.status === 'success' && json.data) {
          setData(json.data);
        }
      } catch (err) {
        console.warn(`[CorporateActionsCard] Failed to fetch corporate action for ${emiten}:`, err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchCorpAction();
    return () => {
      isMounted = false;
    };
  }, [emiten, initialData]);

  if (loading) {
    return (
      <div className={`corp-card corp-card--loading ${className || ''}`}>
        <p className="corp-loading-text">Memuat Jadwal Aksi Korporasi &amp; Risiko Dividen {emiten}…</p>
      </div>
    );
  }

  if (!data) return null;

  const {
    currentPrice,
    tradeDate,
    dividend,
    rightsIssue,
    confluenceRegime,
    convictionScore,
    advisory,
  } = data;

  const regimeClass = getRegimeClass(confluenceRegime);

  return (
    <div className={`corp-card ${className || ''}`}>
      {/* Header */}
      <div className="corp-header">
        <div>
          <div className="corp-title-row">
            <span className="corp-icon" aria-hidden="true">📅</span>
            <h3 className="corp-title">Aksi Korporasi &amp; Risiko Dividend Trap</h3>
            <span className={`corp-regime-pill ${regimeClass}`}>
              {confluenceRegime.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="corp-subtitle">
            {emiten} • Harga Terakhir: <strong>{formatPrice(currentPrice)}</strong> as of {tradeDate}
          </p>
        </div>
        <div className="corp-score-badge">
          <span>Skor Konfluensi:</span>
          <strong>{convictionScore}/100</strong>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className={`corp-advisory ${regimeClass}`}>
        <span className="corp-advisory-text">{advisory}</span>
      </div>

      {/* Metric Grid */}
      <div className="corp-grid">
        {/* Box 1: Cash Dividend Parameters */}
        <div className="corp-box corp-box--dividend">
          <div className="corp-box-head">
            <span className="corp-box-name">Dividen Tunai &amp; Yield</span>
            {dividend.dividendAmount > 0 ? (
              <span className="corp-yield-badge text-positive">+{dividend.dividendYieldPct}% Yield</span>
            ) : (
              <span className="corp-tag-neutral">Nihil</span>
            )}
          </div>
          <div className="corp-box-content">
            <div className="corp-metric-row">
              <span className="corp-metric-label">Dividen per Saham:</span>
              <strong className="corp-metric-value">{formatPrice(dividend.dividendAmount)}</strong>
            </div>
            <div className="corp-metric-row">
              <span className="corp-metric-label">Cum Date:</span>
              <strong className="corp-metric-value">{dividend.cumDate || '-'}</strong>
            </div>
            <div className="corp-metric-row">
              <span className="corp-metric-label">Ex Date:</span>
              <strong className="corp-metric-value">{dividend.exDate || '-'}</strong>
            </div>
            <span className="corp-box-meta">
              {dividend.daysToCum != null
                ? dividend.daysToCum >= 0
                  ? `Sisa ${dividend.daysToCum} sesi menuju Cum Date`
                  : `Telah lewat Cum Date (${Math.abs(dividend.daysToCum)} sesi)`
                : 'Belum dijadwalkan'}
            </span>
          </div>
        </div>

        {/* Box 2: Dividend Trap Risk Meter */}
        <div className="corp-box corp-box--trap">
          <div className="corp-box-head">
            <span className="corp-box-name">Skor Risiko Dividend Trap</span>
            <span className={`corp-trap-badge ${dividend.dividendTrapScore >= 60 ? 'trap-danger' : dividend.dividendTrapScore >= 40 ? 'trap-warning' : 'trap-safe'}`}>
              {dividend.dividendTrapScore >= 60 ? 'RISIKO TINGGI' : dividend.dividendTrapScore >= 40 ? 'WASPADA' : 'AMAN'}
            </span>
          </div>
          <div className="corp-box-content">
            <div className="corp-trap-score-row">
              <span className="corp-trap-score-num">{dividend.dividendTrapScore}</span>
              <span className="corp-trap-score-total">/100</span>
            </div>
            <div className="corp-metric-row">
              <span className="corp-metric-label">Drop Historis Ex-Date:</span>
              <strong className="corp-metric-value">{dividend.historicalExDropRatio}x DPS</strong>
            </div>
            <span className="corp-box-meta">
              Drop &gt; 1.0x mengindikasikan depresiasi harga melebihi dividen bersih
            </span>
          </div>
        </div>

        {/* Box 3: Rights Issue & Dilution */}
        <div className="corp-box corp-box--rights">
          <div className="corp-box-head">
            <span className="corp-box-name">Rights Issue (HMETD)</span>
            {rightsIssue ? (
              <span className={`corp-rights-badge ${rightsIssue.hasStandbyBuyer ? 'rights-secured' : 'rights-unsecured'}`}>
                {rightsIssue.hasStandbyBuyer ? 'ADA PEMBELI SIAGA' : 'TANPA PEMBELI SIAGA'}
              </span>
            ) : (
              <span className="corp-tag-neutral">Nihil</span>
            )}
          </div>
          <div className="corp-box-content">
            {rightsIssue ? (
              <>
                <div className="corp-metric-row">
                  <span className="corp-metric-label">Rasio HMETD:</span>
                  <strong className="corp-metric-value">{rightsIssue.rightsRatio}</strong>
                </div>
                <div className="corp-metric-row">
                  <span className="corp-metric-label">Harga Tebus / Teoritis:</span>
                  <strong className="corp-metric-value">{formatPrice(rightsIssue.exercisePrice)} / {formatPrice(rightsIssue.theoreticalPrice)}</strong>
                </div>
                <div className="corp-metric-row">
                  <span className="corp-metric-label">Tingkat Dilusi:</span>
                  <strong className={`corp-metric-value ${(rightsIssue.dilutionPct ?? 0) > 30 ? 'text-negative' : 'text-neutral'}`}>
                    {rightsIssue.dilutionPct != null ? `${rightsIssue.dilutionPct}%` : '-'}
                  </strong>
                </div>
                <span className="corp-box-meta">
                  {rightsIssue.standbyBuyer ? `Pembeli Siaga: ${rightsIssue.standbyBuyer}` : 'Tanpa komitmen pembeli siaga'}
                </span>
              </>
            ) : (
              <div className="corp-box-empty">Tidak ada jadwal Rights Issue aktif</div>
            )}
          </div>
        </div>

        {/* Box 4: Tactical Timing Strategy */}
        <div className="corp-box corp-box--timing">
          <div className="corp-box-head">
            <span className="corp-box-name">Panduan Eksekusi Taktis</span>
            <span className="corp-tag-strategy">Bebas Pajak 10%</span>
          </div>
          <div className="corp-box-content">
            <div className="corp-strategy-text">
              {dividend.isPreCumRunUpEligible
                ? 'Strategi Pre-Cum Run-Up aktif: Akumulasi momentum capital gain dan realisasikan profit sebelum sesi Cum Date berakhir.'
                : dividend.daysToCum === 0
                ? 'Hari ini sesi Cum Date: Disarankan keluar sebelum penutupan pasar jika tidak bersedia menerima risiko gap down Ex-Date.'
                : 'Tidak ada tindakan darurat aksi korporasi yang mendesak untuk sesi aktif saat ini.'}
            </div>
            <span className="corp-box-meta">
              Pajak PPh dividen 10% tidak berlaku untuk capital gain transaksi bursa
            </span>
          </div>
        </div>
      </div>

      {/* Architectural Notice */}
      <div className="corp-notice">
        <span className="corp-notice-icon" aria-hidden="true">🛡️</span>
        <p className="corp-notice-text">
          <strong>Mandat Arsitektur:</strong> Modul Aksi Korporasi berfungsi sebagai filter kalender
          katalis, penilai risiko Dividend Trap, dan pengukur dilusi rights issue. Tidak pernah memicu
          stance <code>ENTER</code> independen tanpa lolos gerbang Playbook G0–G4.
        </p>
      </div>
    </div>
  );
}
