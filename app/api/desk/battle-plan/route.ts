import { NextRequest, NextResponse } from 'next/server';
import {
  getBattlePlanForDate,
  getLatestMacroPressure,
  getLatestBiRateDecision,
  getLatestWyckoffAssessment,
  getLatestVolumeProfileSnapshot,
  getSectorRotationForSector,
  query,
} from '@/lib/db';
import { sessionDateJakarta, isWeekend, isIdxHoliday } from '@/lib/market-calendar';
import {
  evaluateMacroPressureState,
  applyMacroOverlayToBattlePlan,
  type BattlePlanMacroInput,
} from '@/lib/tactical/macro-overlay';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedDate = searchParams.get('date');
    const now = new Date();
    const planDate = requestedDate || sessionDateJakarta(now);

    const isNonTrading = isWeekend(planDate) || isIdxHoliday(planDate);
    const rows = await getBattlePlanForDate(planDate);

    // Fetch macro state
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

    const macroOverlay = evaluateMacroPressureState({
      rpi,
      latestBiDecision: biDecision,
    });

    const adjustedItems = await Promise.all(
      rows.map(async (item) => {
        const macroInput: BattlePlanMacroInput = {
          emiten: String(item.emiten),
          entryPrice: Number(item.planned_entry || item.entry_price || 0),
          invalidationPrice: Number(item.invalidation_price || 0),
          targetR1: Number(item.target_r1 || 0),
          v15mTargetShares: Number(item.v15m_target_shares || 0),
        };
        const adjusted = applyMacroOverlayToBattlePlan(macroInput, macroOverlay);

        let wyckoffPhase: string | null = null;
        let wyckoffReadiness: number | null = null;
        try {
          const wyckoffRow = await getLatestWyckoffAssessment(String(item.emiten));
          if (wyckoffRow) {
            wyckoffPhase = (wyckoffRow.current_phase as string) || null;
            wyckoffReadiness = wyckoffRow.markup_readiness_score != null ? Number(wyckoffRow.markup_readiness_score) : null;
          }
        } catch {
          // Graceful fallback if Wyckoff table/row is unavailable
        }

        let pocPrice: number | null = null;
        let vahPrice: number | null = null;
        let valPrice: number | null = null;
        try {
          const vpRow = await getLatestVolumeProfileSnapshot(String(item.emiten));
          if (vpRow) {
            pocPrice = vpRow.poc_price != null ? Number(vpRow.poc_price) : null;
            vahPrice = vpRow.vah_price != null ? Number(vpRow.vah_price) : null;
            valPrice = vpRow.val_price != null ? Number(vpRow.val_price) : null;
          }
        } catch {
          // Graceful fallback if volume profile table/row is unavailable
        }

        const emitenUpper = String(item.emiten).toUpperCase();
        const staticSectors: Record<string, string> = {
          BBRI: 'Financials',
          BBCA: 'Financials',
          BMRI: 'Financials',
          BBNI: 'Financials',
          TLKM: 'Infrastructure',
          ISAT: 'Infrastructure',
          TOWR: 'Infrastructure',
          ADRO: 'Energy',
          PTBA: 'Energy',
          PGAS: 'Energy',
          MEDC: 'Energy',
          ASII: 'Industrials',
          UNTR: 'Industrials',
          ICBP: 'Consumer Non-Cyclical',
          INDF: 'Consumer Non-Cyclical',
          MYOR: 'Consumer Non-Cyclical',
          AMRT: 'Consumer Non-Cyclical',
          MDKA: 'Basic Materials',
          ANTM: 'Basic Materials',
          INCO: 'Basic Materials',
          KLBF: 'Healthcare',
          MIKA: 'Healthcare',
          BSDE: 'Properties',
          CTRA: 'Properties',
          SMRA: 'Properties',
          GOTO: 'Technology',
          EMTK: 'Technology',
        };

        let sector: string | null = staticSectors[emitenUpper] || null;
        if (!sector) {
          try {
            const cacheRes = await query(
              `SELECT sector FROM emiten_cache WHERE symbol = $1 LIMIT 1`,
              [emitenUpper]
            );
            if (cacheRes?.rows?.[0]?.sector) {
              sector = String(cacheRes.rows[0].sector);
            }
          } catch {
            // Graceful fallback if cache table is unavailable
          }
        }

        let sectorQuadrant: string | null = null;
        if (sector) {
          try {
            const secRow = await getSectorRotationForSector(sector);
            if (secRow?.quadrant) {
              sectorQuadrant = String(secRow.quadrant);
            }
          } catch {
            // Graceful fallback if sector table is unavailable
          }
        }

        return {
          ...item,
          macro_regime: adjusted.macroRegime,
          adjusted_invalidation_price: adjusted.adjustedInvalidationPrice,
          adjusted_v15m_shares: adjusted.adjustedV15mShares,
          wyckoff_phase: wyckoffPhase,
          wyckoff_readiness: wyckoffReadiness,
          poc_price: pocPrice,
          vah_price: vahPrice,
          val_price: valPrice,
          sector,
          sector_quadrant: sectorQuadrant,
        };
      })
    );

    return NextResponse.json({
      status: 'success',
      planDate,
      isTradingDay: !isNonTrading,
      macroOverlay,
      items: adjustedItems,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
