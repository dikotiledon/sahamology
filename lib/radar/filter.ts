import type { PlaybookCard } from '../playbook/types';
import type { RadarAssessment } from './types';

/**
 * Radar Risk Filter & Confluence Annotator.
 *
 * ZERO-STANCE INVARIANT (Brief §2 Non-Goals):
 * - Radar CANNOT upgrade WAIT or AVOID to ENTER under any circumstances.
 * - Radar CANNOT create an independent trade or bypass gates G0–G4.
 * - Radar may only DOWNGRADE an ENTER to WAIT if severe distribution is detected,
 *   or annotate an existing setup with radar confluence evidence.
 */
export function applyRadarRiskFilter(
  card: PlaybookCard,
  radar: RadarAssessment | null | undefined
): PlaybookCard {
  if (!radar) {
    return card;
  }

  // HARD INVARIANT: If the underlying playbook is not ENTER, radar cannot make it ENTER.
  if (card.stance !== 'ENTER') {
    return card;
  }

  // Downward-only risk filter: If radar flags HEAVY_DISTRIBUTION, downgrade ENTER -> WAIT
  if (radar.verdict === 'HEAVY_DISTRIBUTION') {
    return {
      ...card,
      stance: 'WAIT',
      thesis: `${card.thesis} [Radar veto: Distribusi berat terdeteksi (${radar.score}/100) — jangan kejar]`,
    };
  }

  // For passing setups with radar accumulation evidence, annotate without mutating stance
  return card;
}
