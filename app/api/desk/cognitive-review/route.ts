import { NextRequest, NextResponse } from 'next/server';
import {
  auditTradeDiscipline,
  updatePsychologicalCapital,
  evaluateTraderTilt,
  type TradeDisciplineAuditInput,
  type PsychologicalState,
} from '@/lib/cognitive';
import {
  saveCognitiveReview,
  getCognitiveReviewsForEmiten,
  getTraderPsychologicalCapital,
  saveTraderPsychologicalCapital,
} from '@/lib/db';
import { sessionDateJakarta } from '@/lib/market-calendar';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      emiten,
      tradeDate,
      plannedEntry,
      realizedEntry,
      plannedStop,
      realizedExit,
      targetR1,
      plannedLots,
      realizedLots,
      trendStillBullish,
      minutesSincePreviousStopOut,
      psychologicalStateAtEntry,
      traderReflection,
    } = body;

    if (
      !emiten ||
      plannedEntry == null ||
      realizedEntry == null ||
      plannedStop == null ||
      plannedLots == null ||
      realizedLots == null
    ) {
      return NextResponse.json(
        { status: 'error', error: 'Missing required cognitive review fields' },
        { status: 400 }
      );
    }

    const dateToRecord = tradeDate || sessionDateJakarta(new Date());

    const auditInput: TradeDisciplineAuditInput = {
      emiten: String(emiten).toUpperCase(),
      tradeDate: dateToRecord,
      plannedEntry: Number(plannedEntry),
      realizedEntry: Number(realizedEntry),
      plannedStop: Number(plannedStop),
      realizedExit: realizedExit != null ? Number(realizedExit) : undefined,
      targetR1: targetR1 != null ? Number(targetR1) : Number(plannedEntry) * 1.05,
      plannedLots: Number(plannedLots),
      realizedLots: Number(realizedLots),
      trendStillBullish: trendStillBullish !== false,
      minutesSincePreviousStopOut:
        minutesSincePreviousStopOut != null ? Number(minutesSincePreviousStopOut) : undefined,
      psychologicalStateAtEntry: (psychologicalStateAtEntry as PsychologicalState) || 'CALM',
      traderReflection: traderReflection ? String(traderReflection) : undefined,
    };

    const review = auditTradeDiscipline(auditInput);

    // Fetch existing psychological capital from DB or use defaults
    let currentCapitalPct = 100;
    let consecutiveViolations = 0;

    try {
      const dbCapital = await getTraderPsychologicalCapital();
      if (dbCapital) {
        if (dbCapital.capital_score != null) {
          currentCapitalPct = Number(dbCapital.capital_score);
        }
        if (dbCapital.consecutive_violations != null) {
          consecutiveViolations = Number(dbCapital.consecutive_violations);
        }
      }
    } catch {
      // DB offline or table missing; continue with defaults
    }

    // Update psychological capital and violations
    const updatedCapital = updatePsychologicalCapital(currentCapitalPct, review);
    const updatedViolations = review.isDisciplined ? 0 : consecutiveViolations + 1;
    const tiltStatus = evaluateTraderTilt({
      currentCapitalPct: updatedCapital,
      consecutiveViolations: updatedViolations,
      recentReviews: [review],
    });

    // Attempt to persist review and updated capital
    try {
      await saveCognitiveReview({
        emiten: review.emiten,
        trade_date: review.tradeDate,
        planned_entry: auditInput.plannedEntry,
        realized_entry: auditInput.realizedEntry,
        planned_stop: auditInput.plannedStop,
        realized_exit: auditInput.realizedExit ?? null,
        planned_lots: auditInput.plannedLots,
        realized_lots: auditInput.realizedLots,
        discipline_score: review.disciplineScore,
        grade: review.grade,
        deviations: review.deviations.map((d) => ({ ...d })),
        psychological_state: review.psychologicalState,
        trader_reflection: review.traderReflection,
      });

      await saveTraderPsychologicalCapital({
        capital_score: tiltStatus.psychologicalCapitalPct,
        consecutive_violations: tiltStatus.consecutiveViolations,
        tilt_state: tiltStatus.tiltState,
      });
    } catch {
      // In-memory fallback if database write fails
    }

    return NextResponse.json({
      status: 'success',
      review,
      tilt: tiltStatus,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const emiten = searchParams.get('emiten')?.toUpperCase();
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 10)));

    let tiltStatus = evaluateTraderTilt({
      currentCapitalPct: 100,
      consecutiveViolations: 0,
    });

    let reviews: Array<Record<string, unknown>> = [];

    try {
      const dbCapital = await getTraderPsychologicalCapital();
      if (dbCapital) {
        tiltStatus = evaluateTraderTilt({
          currentCapitalPct: Number(dbCapital.capital_score ?? 100),
          consecutiveViolations: Number(dbCapital.consecutive_violations ?? 0),
        });
      }

      if (emiten) {
        reviews = await getCognitiveReviewsForEmiten(emiten, limit);
      }
    } catch {
      // Database offline fallback
    }

    return NextResponse.json({
      status: 'success',
      tilt: tiltStatus,
      reviews,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
