import { NextResponse } from 'next/server';
import { getLatestMacroPressure, getLatestBiRateDecision } from '@/lib/db';
import { evaluateMacroPressureState } from '@/lib/tactical/macro-overlay';

export async function GET() {
  try {
    const macroRow = await getLatestMacroPressure();
    const biRow = await getLatestBiRateDecision();

    const rpi = macroRow
      ? {
          currentSpot: macroRow.usdIdrClose,
          velocity5dPct: macroRow.velocity5dPct,
          velocity20dPct: macroRow.velocity20dPct,
          pressureScore: macroRow.pressureScore,
          isAboveCriticalThreshold:
            macroRow.usdIdrClose >= 16500 || macroRow.velocity5dPct >= 2.5,
        }
      : null;

    const biDecision = biRow
      ? {
          meetingDate: biRow.meetingDate,
          rate: biRow.rate,
          previousRate: biRow.previousRate,
          action: biRow.action,
        }
      : null;

    const state = evaluateMacroPressureState({
      rpi,
      latestBiDecision: biDecision,
    });

    return NextResponse.json({
      status: 'success',
      macroPressure: macroRow,
      biRateDecision: biRow,
      evaluatedState: state,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
