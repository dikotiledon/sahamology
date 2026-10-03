import { getIdxTickSize } from '@/lib/risk/sizer';
import type {
  TradeDisciplineAuditInput,
  TradeDisciplineReview,
  CognitiveDeviation,
  DisciplineGrade,
} from './types';

export function auditTradeDiscipline(input: TradeDisciplineAuditInput): TradeDisciplineReview {
  const deviations: CognitiveDeviation[] = [];

  const entryTick = getIdxTickSize(input.plannedEntry);
  const stopTick = getIdxTickSize(input.plannedStop);

  // 1. FOMO Chasing: realized entry > planned entry by more than 2 ticks
  if (input.realizedEntry > input.plannedEntry) {
    const entryTicks = (input.realizedEntry - input.plannedEntry) / entryTick;
    if (entryTicks > 2.0) {
      deviations.push({
        type: 'FOMO_CHASE',
        penalty: 25,
        severity: entryTicks > 5.0 ? 'SEVERE' : 'MODERATE',
        description: `Entry slipped by ${entryTicks.toFixed(1)} ticks above planned entry (${input.realizedEntry} vs ${input.plannedEntry}).`,
      });
    }
  }

  // 2. Stop Widening / Loss Aversion: exit lower than planned stop by > 1 tick
  if (input.realizedExit != null && input.realizedExit < input.plannedStop) {
    const ticksPastStop = (input.plannedStop - input.realizedExit) / stopTick;
    if (ticksPastStop > 1.0) {
      deviations.push({
        type: 'STOP_WIDENED',
        penalty: 35,
        severity: 'SEVERE',
        description: `Position closed below planned invalidation stop by ${ticksPastStop.toFixed(1)} ticks (${input.realizedExit} vs ${input.plannedStop}).`,
      });
    }
  }

  // 3. Premature Exit / Paper Hands: exited with a gain, but < 50% to target R1 while trend is bullish
  if (
    input.realizedExit != null &&
    input.targetR1 > input.plannedEntry &&
    input.realizedExit > input.plannedEntry
  ) {
    const plannedDistance = input.targetR1 - input.plannedEntry;
    const realizedDistance = input.realizedExit - input.plannedEntry;
    if (realizedDistance < 0.5 * plannedDistance && input.trendStillBullish !== false) {
      const pctCaptured = Math.round((realizedDistance / plannedDistance) * 100);
      deviations.push({
        type: 'PREMATURE_EXIT',
        penalty: 20,
        severity: 'MILD',
        description: `Took premature profit at +${pctCaptured}% of distance to Target R1 while trend structure remained bullish.`,
      });
    }
  }

  // 4. Position Oversizing: executed lots > 1.15x planned lots
  if (input.plannedLots > 0 && input.realizedLots > 1.15 * input.plannedLots) {
    const excessPct = Math.round(((input.realizedLots - input.plannedLots) / input.plannedLots) * 100);
    deviations.push({
      type: 'OVERSIZING',
      penalty: 25,
      severity: excessPct > 50 ? 'SEVERE' : 'MODERATE',
      description: `Position oversized by +${excessPct}% (${input.realizedLots} lots vs planned ${input.plannedLots} lots).`,
    });
  }

  // 5. Revenge Trading: entry within 30 minutes of a stopped-out trade
  if (
    input.minutesSincePreviousStopOut != null &&
    input.minutesSincePreviousStopOut <= 30
  ) {
    deviations.push({
      type: 'REVENGE_TRADE',
      penalty: 30,
      severity: 'SEVERE',
      description: `Entry executed within ${input.minutesSincePreviousStopOut}m of previous stop-out loss (revenge trade vulnerability).`,
    });
  }

  const totalPenalty = deviations.reduce((acc, d) => acc + d.penalty, 0);
  const disciplineScore = Math.max(0, 100 - totalPenalty);

  let grade: DisciplineGrade = 'MASTER_DISCIPLINE';
  if (disciplineScore < 50) {
    grade = 'UNGOVERNED_EXECUTION';
  } else if (disciplineScore < 70) {
    grade = 'SLIPPY_DISCIPLINE';
  } else if (disciplineScore < 85) {
    grade = 'ACCEPTABLE_EXECUTION';
  }

  const isDisciplined = disciplineScore >= 70;
  const summary = `${grade.replace(/_/g, ' ')}: Score ${disciplineScore}/100 with ${deviations.length} deviation(s).`;

  return {
    emiten: input.emiten,
    tradeDate: input.tradeDate,
    disciplineScore,
    grade,
    deviations,
    isDisciplined,
    summary,
    psychologicalState: input.psychologicalStateAtEntry || 'CALM',
    traderReflection: input.traderReflection,
  };
}
