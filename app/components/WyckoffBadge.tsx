'use client';

import React from 'react';
import type { WyckoffPhase } from '@/lib/wyckoff/types';

export interface WyckoffBadgeProps {
  phase: WyckoffPhase;
  confidenceScore?: number;
}

const PHASE_CONFIG: Record<
  WyckoffPhase,
  { label: string; modifier: string }
> = {
  PHASE_A_STOPPING: {
    label: 'Phase A (Stopping)',
    modifier: 'wyckoff-badge--stopping',
  },
  PHASE_B_ABSORPTION: {
    label: 'Phase B (Absorption)',
    modifier: 'wyckoff-badge--absorption',
  },
  PHASE_C_SPRING: {
    label: '🎯 Phase C (Spring)',
    modifier: 'wyckoff-badge--spring',
  },
  PHASE_D_TRANSITION: {
    label: 'Phase D (SOS)',
    modifier: 'wyckoff-badge--transition',
  },
  PHASE_E_MARKUP: {
    label: '🚀 Phase E (Markup)',
    modifier: 'wyckoff-badge--markup',
  },
  PHASE_DISTRIBUTION: {
    label: '⚠️ Distribution',
    modifier: 'wyckoff-badge--distribution',
  },
  WYCKOFF_UNCLASSIFIED: {
    label: 'Unclassified',
    modifier: 'wyckoff-badge--unclassified',
  },
};

export function WyckoffBadge({ phase, confidenceScore }: WyckoffBadgeProps) {
  const config = PHASE_CONFIG[phase] || PHASE_CONFIG.WYCKOFF_UNCLASSIFIED;

  return (
    <span
      className={`wyckoff-badge ${config.modifier}`}
      title={confidenceScore !== undefined ? `Confidence: ${confidenceScore}%` : undefined}
    >
      {config.label}
    </span>
  );
}
