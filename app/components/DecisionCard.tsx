'use client';

import type { PlaybookResult } from '@/lib/playbook';

interface DecisionCardProps {
  playbook: PlaybookResult;
  emiten: string;
}

const STANCE_STYLE: Record<PlaybookResult['stance'], { label: string; background: string; color: string }> = {
  ENTER: { label: 'ENTER', background: '#16a34a', color: '#ffffff' },
  WAIT: { label: 'WAIT', background: '#f59e0b', color: '#1f2937' },
  AVOID: { label: 'AVOID', background: '#dc2626', color: '#ffffff' },
  TAKE_PROFIT: { label: 'TAKE PROFIT', background: '#2563eb', color: '#ffffff' },
  INVALIDATED: { label: 'INVALIDATED', background: '#4b5563', color: '#ffffff' },
};

export default function DecisionCard({ playbook, emiten }: DecisionCardProps) {
  const style = STANCE_STYLE[playbook.stance];

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

      {playbook.failedGates.length > 0 && (
        <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
          {playbook.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}

      {playbook.stance === 'ENTER' && (
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0.25rem 1rem', margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
          <dt style={{ opacity: 0.7 }}>Entry</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{playbook.entryPrice.toLocaleString()}</dd>
          <dt style={{ opacity: 0.7 }}>Target R1</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{playbook.targetR1.toLocaleString()}</dd>
          <dt style={{ opacity: 0.7 }}>Target Max</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{playbook.targetMax.toLocaleString()}</dd>
          <dt style={{ opacity: 0.7 }}>Invalidation</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{playbook.invalidation.toLocaleString()}</dd>
          <dt style={{ opacity: 0.7 }}>Net R:R</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{playbook.netRR?.toFixed(2) ?? '—'}</dd>
        </dl>
      )}
    </div>
  );
}
