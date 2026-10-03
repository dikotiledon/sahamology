import { NextRequest, NextResponse } from 'next/server';
import {
  getBattlePlanForDate,
  getLatestMacroPressure,
  getLatestBiRateDecision,
  getLatestWyckoffAssessment,
  getLatestVolumeProfileSnapshot,
  getSectorRotationForSector,
  getLatestVcpSnapshot,
  getLatestMarketBreadthSnapshot,
  getLatestAnchoredVwap,
  getLatestSmartMoney,
  getLatestMtf,
  getLatestOrb,
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

        let vcpStage: string | null = null;
        let vcpPivot: number | null = null;
        let vcpRiskPct: number | null = null;
        try {
          const vcpRow = await getLatestVcpSnapshot(emitenUpper);
          if (vcpRow) {
            vcpStage = (vcpRow.vcp_stage as string) || null;
            vcpPivot = vcpRow.pivot_price != null ? Number(vcpRow.pivot_price) : null;
            if (vcpRow.pivot_price && vcpRow.stop_loss_price) {
              const p = Number(vcpRow.pivot_price);
              const s = Number(vcpRow.stop_loss_price);
              if (p > s && p > 0) {
                vcpRiskPct = Number((((p - s) / p) * 100).toFixed(2));
              }
            }
          }
        } catch {
          // Graceful fallback if VCP table is unavailable
        }

        let baseAvwap: number | null = null;
        let bandarVwap: number | null = null;
        try {
          const avwapRow = await getLatestAnchoredVwap(emitenUpper);
          if (avwapRow) {
            baseAvwap = avwapRow.base_avwap != null ? Number(avwapRow.base_avwap) : null;
            bandarVwap = avwapRow.bandar_vwap_top3 != null ? Number(avwapRow.bandar_vwap_top3) : null;
          }
        } catch {
          // Graceful fallback if AVWAP table is unavailable
        }

        let orderBlockTop: number | null = null;
        let orderBlockBottom: number | null = null;
        let fvgTop: number | null = null;
        let fvgBottom: number | null = null;
        let smcRegime: string | null = null;
        try {
          const smcRow = await getLatestSmartMoney(emitenUpper);
          if (smcRow) {
            smcRegime = (smcRow.confluence_regime as string) || null;
            const ob = smcRow.active_bullish_ob as { top?: number; bottom?: number } | null;
            if (ob) {
              orderBlockTop = ob.top != null ? Number(ob.top) : null;
              orderBlockBottom = ob.bottom != null ? Number(ob.bottom) : null;
            }
            const fvg = smcRow.active_bullish_fvg as { top?: number; bottom?: number } | null;
            if (fvg) {
              fvgTop = fvg.top != null ? Number(fvg.top) : null;
              fvgBottom = fvg.bottom != null ? Number(fvg.bottom) : null;
            }
          }
        } catch {
          // Graceful fallback if SMC table is unavailable
        }

        let mtfRegime: string | null = null;
        let mtfStage: string | null = null;
        let mtfSizingMultiplier: number | null = null;
        try {
          const mtfRow = await getLatestMtf(emitenUpper);
          if (mtfRow) {
            mtfRegime = (mtfRow.alignment_regime as string) || null;
            mtfStage = (mtfRow.weekly_stage as string) || null;
            mtfSizingMultiplier = mtfRow.sizing_multiplier != null ? Number(mtfRow.sizing_multiplier) : null;
          }
        } catch {
          // Graceful fallback if MTF table is unavailable
        }

        let ib15High: number | null = null;
        let ib15Low: number | null = null;
        let ib15Range: number | null = null;
        let orbRegime: string | null = null;
        try {
          const orbRow = await getLatestOrb(emitenUpper);
          if (orbRow) {
            ib15High = orbRow.ib15_high != null ? Number(orbRow.ib15_high) : null;
            ib15Low = orbRow.ib15_low != null ? Number(orbRow.ib15_low) : null;
            ib15Range = orbRow.ib15_range != null ? Number(orbRow.ib15_range) : null;
            orbRegime = (orbRow.confluence_regime as string) || null;
          }
        } catch {
          // Graceful fallback if ORB table is unavailable
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
          vcp_stage: vcpStage,
          vcp_pivot: vcpPivot,
          vcp_risk_pct: vcpRiskPct,
          base_avwap: baseAvwap,
          bandar_vwap: bandarVwap,
          order_block_top: orderBlockTop,
          order_block_bottom: orderBlockBottom,
          fvg_top: fvgTop,
          fvg_bottom: fvgBottom,
          smc_regime: smcRegime,
          mtf_regime: mtfRegime,
          mtf_stage: mtfStage,
          mtf_sizing_multiplier: mtfSizingMultiplier,
          ib15_high: ib15High,
          ib15_low: ib15Low,
          ib15_range: ib15Range,
          orb_regime: orbRegime,
        };
      })
    );

    let marketBreadth: { regime: string; score: number; adRatio: number; advisory?: string } | null = null;
    try {
      const bRow = await getLatestMarketBreadthSnapshot(planDate);
      if (bRow) {
        marketBreadth = {
          regime: String(bRow.market_regime),
          score: Number(bRow.regime_score),
          adRatio: Number(bRow.ad_ratio),
          advisory: bRow.advisory ? String(bRow.advisory) : undefined,
        };
      }
    } catch {
      // Graceful fallback if breadth table is unpopulated
    }

    return NextResponse.json({
      status: 'success',
      planDate,
      isTradingDay: !isNonTrading,
      macroOverlay,
      marketBreadth,
      items: adjustedItems,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
