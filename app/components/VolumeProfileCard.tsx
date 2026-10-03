'use client';

import React from 'react';
import type { VolumeProfileResult, VolumeProfileConfluence } from '@/lib/volume-profile';

export interface VolumeProfileCardProps {
  profile: VolumeProfileResult;
  confluence?: VolumeProfileConfluence;
}

function getBadgeConfig(status?: string): { label: string; modifier: string } {
  switch (status) {
    case 'AT_POC_SUPPORT':
      return { label: '🎯 POC Support', modifier: 'vp-badge--poc' };
    case 'IN_LOW_VOLUME_VOID':
      return { label: '⚠️ Low Volume Void', modifier: 'vp-badge--lvn' };
    case 'ABOVE_VALUE_AREA':
      return { label: '🚀 Above Value Area', modifier: 'vp-badge--va' };
    case 'BELOW_VALUE_AREA':
      return { label: 'Discount Area', modifier: 'vp-badge--neutral' };
    case 'INSIDE_VALUE_AREA':
      return { label: 'Inside Value Area', modifier: 'vp-badge--va' };
    default:
      return { label: 'Consensus Base', modifier: 'vp-badge--neutral' };
  }
}

export function VolumeProfileCard({ profile, confluence }: VolumeProfileCardProps) {
  const { emiten, lookbackDays, pocPrice, vahPrice, valPrice, valueAreaVolumePct, bins, totalVolume } =
    profile;

  const badgeConfig = getBadgeConfig(confluence?.status);

  // Sort descending by price so higher prices appear at the top, like an order book / chart
  const sortedBinsDesc = [...bins].sort((a, b) => b.price - a.price);
  const maxBinVolume = Math.max(...bins.map((b) => b.volume), 1);

  return (
    <div className="vp-card">
      <div className="vp-header">
        <div>
          <div className="vp-title-row">
            <h4 className="vp-title">Volume Profile: {emiten}</h4>
            <span className={`vp-badge ${badgeConfig.modifier}`}>{badgeConfig.label}</span>
          </div>
          <p className="vp-subtitle">
            Distribusi akumulasi volume-by-price {lookbackDays} sesi &amp; Value Area 70%.
          </p>
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Total Vol: <strong>{Math.round(totalVolume / 100).toLocaleString('id-ID')} lot</strong>
        </div>
      </div>

      <div className="vp-grid">
        <div className="vp-metric-box vp-metric-box--poc">
          <span>Point of Control (POC)</span>
          <strong>Rp {Number(pocPrice).toLocaleString('id-ID')}</strong>
        </div>
        <div className="vp-metric-box vp-metric-box--va">
          <span>Value Area High (VAH)</span>
          <strong>Rp {Number(vahPrice).toLocaleString('id-ID')}</strong>
        </div>
        <div className="vp-metric-box vp-metric-box--va">
          <span>Value Area Low (VAL)</span>
          <strong>Rp {Number(valPrice).toLocaleString('id-ID')}</strong>
        </div>
        <div className="vp-metric-box">
          <span>Value Area Coverage</span>
          <strong>{valueAreaVolumePct}% Volume</strong>
        </div>
      </div>

      {confluence && (
        <div className="vp-confluence-alert">
          <strong>Likuiditas Eksekusi:</strong>
          <span>{confluence.summary}</span>
        </div>
      )}

      {sortedBinsDesc.length > 0 && (
        <div className="vp-histogram">
          {sortedBinsDesc.map((bin) => {
            const fillPct = Math.min(100, Math.max(2, (bin.volume / maxBinVolume) * 100));
            const fillClass = bin.isPoc
              ? 'vp-bar-fill--poc'
              : bin.isValueArea
                ? 'vp-bar-fill--va'
                : 'vp-bar-fill--out';

            return (
              <div key={bin.price} className="vp-bar-row">
                <span className={`vp-bar-price ${bin.isPoc ? 'is-poc' : ''}`}>
                  {bin.price.toLocaleString('id-ID')}
                </span>
                <div className="vp-bar-track">
                  <div
                    className={`vp-bar-fill ${fillClass}`}
                    style={{ width: `${fillPct}%` }}
                    title={`Rp ${bin.price}: ${Math.round(bin.volume / 100).toLocaleString('id-ID')} lot (${bin.volumePct}%)`}
                  />
                </div>
                <div className="vp-bar-labels">
                  <span>{bin.volumePct.toFixed(1)}%</span>
                  {bin.isHvn && <span className="vp-node-tag vp-node-tag--hvn">HVN</span>}
                  {bin.isLvn && <span className="vp-node-tag vp-node-tag--lvn">LVN</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="vp-boundary-notice">
        <span>
          🛡️ Mandat Arsitektur: Volume Profile bertindak sebagai jangkar likuiditas &amp; estimasi
          slippage, bukan pembuka posisi mandiri. Eksekusi <strong>ENTER</strong> wajib lulus Playbook G0–G4.
        </span>
      </div>
    </div>
  );
}
