'use client';

import type { PlaybookCard } from '@/lib/playbook';

interface DecisionCardProps {
  card: PlaybookCard;
  emiten: string;
  priorBandar?: string[];
}

const STANCE_STYLE: Record<PlaybookCard['stance'], { label: string; background: string; color: string }> = {
  ENTER: { label: 'Masuk', background: '#16a34a', color: '#ffffff' },
  WAIT: { label: 'Tunggu', background: '#f59e0b', color: '#1f2937' },
  AVOID: { label: 'Hindari', background: '#dc2626', color: '#ffffff' },
  TAKE_PROFIT: { label: 'Ambil Profit', background: '#2563eb', color: '#ffffff' },
  INVALIDATED: { label: 'Batal', background: '#4b5563', color: '#ffffff' },
};

function fmt(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID');
}

const PATTERN_LABEL: Record<string, string> = {
  spring: 'Spring (P1)',
  higher_low: 'Higher Low (P2)',
  break_prior_high: 'Break Prior High (P3)',
};

export default function DecisionCard({ card, emiten, priorBandar }: DecisionCardProps) {
  const style = STANCE_STYLE[card.stance];

  return (
    <div
      className="decision-card"
      style={{
        border: `2px solid ${style.background}`,
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        background: '#0f172a',
        color: '#e2e8f0',
        minWidth: '260px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8 }}>
          {emiten} · Decision
        </span>
        <span
          style={{
            background: style.background,
            color: style.color,
            fontWeight: 700,
            borderRadius: '999px',
            padding: '0.3rem 0.9rem',
            fontSize: '0.85rem',
          }}
        >
          {style.label}
        </span>
      </div>

      <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', opacity: 0.9 }}>{card.thesis}</p>

      {card.failedGates.length > 0 && (
        <div style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', opacity: 0.75 }}>
          Gate gagal: {card.failedGates.join(', ')}
        </div>
      )}

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 1rem', margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
        <dt style={{ opacity: 0.7 }}>Entry</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(card.entry)}</dd>
        <dt style={{ opacity: 0.7 }}>Target R1</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(card.r1)}</dd>
        <dt style={{ opacity: 0.7 }}>Target Max</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(card.max)}</dd>
        <dt style={{ opacity: 0.7 }}>Invalidasi</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{fmt(card.invalidation)}</dd>
        <dt style={{ opacity: 0.7 }}>Net R:R</dt>
        <dd style={{ margin: 0, fontWeight: 600 }}>{card.rr === null ? '—' : card.rr.toFixed(2)}</dd>
      </dl>

      {priorBandar && priorBandar.length > 0 && (
        <div style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', opacity: 0.75 }}>
          Bandar 5 print terakhir: {priorBandar.join(' → ')}
        </div>
      )}

      {card.tape && (
        <div
          style={{
            margin: '0.75rem 0 0',
            padding: '0.6rem 0.75rem',
            borderRadius: '8px',
            background: '#1e293b',
            fontSize: '0.8rem',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Tape Filter</div>
          <div>ATR(14): {fmt(card.tape.atr)}</div>
          <div>
            EMA(20): {fmt(card.tape.ema20)}{' '}
            {card.tape.emaSlope === 'up' ? '↗' : card.tape.emaSlope === 'down' ? '↘' : ''}
          </div>
          <div>
            Tren:{' '}
            {card.tape.trendOk ? 'Di atas 20-EMA' : 'Tertahan (di bawah 20-EMA)'}
          </div>
          <div>
            Pola: {card.tape.pattern ? PATTERN_LABEL[card.tape.pattern] ?? card.tape.pattern : '—'}
          </div>
          <div style={{ opacity: 0.7 }}>Bar selesai: {card.tape.barsUsed}</div>
          <div style={{ opacity: 0.7 }}>
            Sumber invalidasi: {card.tape.invalidationSource === 'atr' ? 'ATR (Phase 1)' : 'Interim (Phase 0)'}
          </div>
        </div>
      )}
    </div>
  );
}
