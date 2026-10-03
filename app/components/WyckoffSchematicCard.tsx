'use client';

import React from 'react';
import type { WyckoffAssessment } from '@/lib/wyckoff/types';
import { WyckoffBadge } from './WyckoffBadge';

export interface WyckoffSchematicCardProps {
  assessment: WyckoffAssessment;
}

export function WyckoffSchematicCard({ assessment }: WyckoffSchematicCardProps) {
  const {
    emiten,
    phase,
    confidenceScore,
    markupReadinessScore,
    tradingRange,
    activeEvents,
    springDetected,
    springLow,
    confluenceTags,
  } = assessment;

  return (
    <div className="wyckoff-card">
      <div className="wyckoff-card-header">
        <div>
          <div className="wyckoff-title-row">
            <h4 className="wyckoff-title">Wyckoff Structure: {emiten}</h4>
            <WyckoffBadge phase={phase} confidenceScore={confidenceScore} />
          </div>
          <p className="wyckoff-subtitle">
            Analisis fase akumulasi/distribusi &amp; konfluensi rentang konsolidasi.
          </p>
        </div>
        <div className="wyckoff-readiness-pill">
          <span>Markup Readiness:</span>
          <strong>{markupReadinessScore}%</strong>
        </div>
      </div>

      {springDetected && springLow && (
        <div className="wyckoff-spring-alert">
          <strong>🎯 Spring Shakeout Terkonfirmasi!</strong>
          <span>
            Batas invalidasi struktural berada di titik terendah Spring (Rp{' '}
            {Number(springLow).toLocaleString('id-ID')}).
          </span>
        </div>
      )}

      {tradingRange ? (
        <div className="wyckoff-range-box">
          <div className="wyckoff-range-head">
            <span>Trading Range ({tradingRange.barCount} bars)</span>
            <span className="wyckoff-range-status">Status: {tradingRange.status}</span>
          </div>

          <div className="wyckoff-range-grid">
            <div className="wyckoff-level-box wyckoff-level--ice">
              <span>Support (ICE)</span>
              <strong>Rp {Number(tradingRange.iceSupport).toLocaleString('id-ID')}</strong>
            </div>
            <div className="wyckoff-level-box wyckoff-level--mid">
              <span>Midpoint</span>
              <strong>Rp {Number(tradingRange.midpoint).toLocaleString('id-ID')}</strong>
            </div>
            <div className="wyckoff-level-box wyckoff-level--creek">
              <span>Resistance (CREEK)</span>
              <strong>Rp {Number(tradingRange.creekResistance).toLocaleString('id-ID')}</strong>
            </div>
            <div className="wyckoff-level-box">
              <span>Range Width</span>
              <strong>{tradingRange.rangeWidthPct}%</strong>
            </div>
          </div>
        </div>
      ) : (
        <div className="wyckoff-no-range">
          <span>Belum terdeteksi rentang konsolidasi aktif (Trading Range).</span>
        </div>
      )}

      {activeEvents.length > 0 && (
        <div className="wyckoff-events-container">
          <h5 className="wyckoff-events-title">Milestone Struktural Terdeteksi:</h5>
          <div className="wyckoff-events-list">
            {activeEvents.slice(-4).map((evt, idx) => (
              <div key={`${evt.type}-${evt.date}-${idx}`} className="wyckoff-event-item">
                <span className="wyckoff-event-tag">{evt.type}</span>
                <span className="wyckoff-event-date">{evt.date}</span>
                <span className="wyckoff-event-desc">{evt.notes}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {confluenceTags.length > 0 && (
        <div className="wyckoff-tags-row">
          {confluenceTags.map((tag) => (
            <span key={tag} className="wyckoff-tag">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="wyckoff-boundary-notice">
        <span>
          🛡️ Mandat Arsitektur: Analisis Wyckoff bertindak sebagai konfluensi asimetri aliran, bukan
          pembuka posisi mandiri. Eksekusi <strong>ENTER</strong> wajib lulus Playbook G0–G4.
        </span>
      </div>
    </div>
  );
}
