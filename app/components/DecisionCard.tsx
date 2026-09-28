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

/** D15: micro labels are Indonesian; the state keys stay machine English. */

/**
 * Phase 3. Same rule for the fundamental block: the LABEL is Indonesian, the
 * underlying state key stays machine English so the journal and the replay
 * agree with what the operator sees.
 *
 * NOT_EVALUATED is given a badge rather than hidden, for the reason this project
 * has been fighting since Phase 0: a gate that is silently inactive is
 * indistinguishable from a gate that ran and found nothing. "Tidak
 * dievaluasi" is a real, different answer from "Sehat".
 */
const FUNDAMENTAL_LABEL = {
  SOUND: { label: 'Sehat', color: 'green' as const },
  WEAK: { label: 'Lemah', color: 'yellow' as const },
  LANDMINE: { label: 'Bahaya', color: 'red' as const },
  NOT_EVALUATED: { label: 'Tidak dievaluasi', color: 'gray' as const },
} as const;

const CLAUSE_LABEL = {
  NEGATIVE_EQUITY: 'Ekuitas negatif',
  EXTREME_LEVERAGE: 'Leverage ekstrem',
  DISTRESS_SCORE: 'Skor classically distress',
} as const;

const G5_MODE_LABEL = {
  off: 'Nonaktif',
  visible: 'Skor saja',
  veto: 'Veto aktif',
} as const;
const ACCDIST_LABEL: Record<string, { label: string; color: string }> = {
  ACC: { label: 'Big Acc', color: '#16a34a' },
  SMALL_ACC: { label: 'Small Acc', color: '#4ade80' },
  NEUTRAL: { label: 'Neutral', color: '#94a3b8' },
  SMALL_DIST: { label: 'Small Dist', color: '#fb923c' },
  DIST: { label: 'Big Dist', color: '#dc2626' },
  UNKNOWN: { label: 'Tidak tersedia', color: '#64748b' },
};

const TIER_LABEL: Record<string, { label: string; color: string }> = {
  spike: { label: 'Spike (1)', color: '#f59e0b' },
  building: { label: 'Bertahan 2', color: '#38bdf8' },
  persistent: { label: 'Persist 3', color: '#16a34a' },
};

const FLOW_LABEL: Record<string, { label: string; color: string }> = {
  ok: { label: 'Net buyer', color: '#16a34a' },
  neutral: { label: 'Netral', color: '#94a3b8' },
  bad: { label: 'Net seller', color: '#dc2626' },
  NOT_EVALUATED: { label: 'Tidak dievaluasi', color: '#64748b' },
};

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.45rem',
        borderRadius: '999px',
        background: `${color}26`,
        border: `1px solid ${color}`,
        color,
        fontSize: '0.72rem',
        fontWeight: 600,
        marginRight: '0.35rem',
      }}
    >
      {children}
    </span>
  );
}

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

      {card.micro && (
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
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Persistensi &amp; Micro</div>
          <div>
            <span style={{ opacity: 0.7, marginRight: '0.35rem' }}>Akumulasi:</span>
            <Badge color={(ACCDIST_LABEL[card.micro.accdistState] ?? ACCDIST_LABEL.UNKNOWN).color}>
              {(ACCDIST_LABEL[card.micro.accdistState] ?? ACCDIST_LABEL.UNKNOWN).label}
            </Badge>
            {!card.micro.accdistEvaluated && (
              <span style={{ opacity: 0.7, whiteSpace: 'nowrap', marginLeft: '0.35rem' }}>
                tidak dievaluasi
              </span>
            )}
          </div>
          <div>
            <span style={{ opacity: 0.7, marginRight: '0.35rem' }}>Streak:</span>
            {card.micro.tier ? (
              <Badge color={TIER_LABEL[card.micro.tier].color}>{TIER_LABEL[card.micro.tier].label}</Badge>
            ) : (
              <span style={{ opacity: 0.7, marginRight: '0.35rem' }}>—</span>
            )}
            {card.micro.bandCode && (
              <span style={{ opacity: 0.7 }}>bandar {card.micro.bandCode}</span>
            )}
          </div>
          <div>
            <span style={{ opacity: 0.7, marginRight: '0.35rem' }}>Aliran broker:</span>
            <Badge color={FLOW_LABEL[card.micro.flowState].color}>
              {FLOW_LABEL[card.micro.flowState].label}
            </Badge>
          </div>
          <div style={{ opacity: 0.7 }}>Profil G1: {card.micro.g1Profile === 'phase-2' ? 'Phase 2' : 'Phase 1'}</div>
        </div>
      )}

      {/*
        Phase 3 G5. Rendered whenever a fundamental reading exists, INCLUDING
        under the 'off' profile, where it is inert. The mode row is always
        shown so the operator can see that the gate exists and what it is
        currently armed to do — never left to be inferred from its absence.
      */}
      {card.fundamental && (
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
          <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Kesehatan Fundamental</div>
          <div>
            <span style={{ opacity: 0.7, marginRight: '0.35rem' }}>Status:</span>
            <Badge color={FUNDAMENTAL_LABEL[card.fundamental.state].color}>
              {FUNDAMENTAL_LABEL[card.fundamental.state].label}
            </Badge>
          </div>
          {card.fundamental.clauses.length > 0 && (
            <div>
              <span style={{ opacity: 0.7, marginRight: '0.35rem' }}>Pemicu:</span>
              {card.fundamental.clauses.map((clause) => (
                <span key={clause} style={{ marginRight: '0.35rem', whiteSpace: 'nowrap' }}>
                  {CLAUSE_LABEL[clause] ?? clause}
                </span>
              ))}
            </div>
          )}
          {card.fundamental.isFinancialIssuer && (
            <div style={{ opacity: 0.7 }}>
              Emiten keuangan: rasio leverage tidak setara dengan non-keuangan
            </div>
          )}
          <div style={{ opacity: 0.7 }}>
            Mode G5: {G5_MODE_LABEL[card.fundamental.g5Profile]}
          </div>
        </div>
      )}
    </div>
  );
}
