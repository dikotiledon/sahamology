import { NextRequest, NextResponse } from 'next/server';
import {
  type SectorRotationMetric,
  type SectorQuadrant,
  evaluateSectorConfluence,
} from '@/lib/sector';
import {
  getLatestSectorRotationSnapshots,
  getSectorRotationForSector,
} from '@/lib/db';
import { sessionDateJakarta } from '@/lib/market-calendar';

function getDefaultSectors(asOfDate: string): SectorRotationMetric[] {
  return [
    {
      sector: 'Financials',
      asOfDate,
      rsRatio: 104.5,
      rsMomentum: 102.3,
      netFlow5d: 320_000_000_000,
      netFlow20d: 950_000_000_000,
      flowIntensityPct: 15.2,
      quadrant: 'LEADING' as SectorQuadrant,
      constituentCount: 4,
      topEmiten: 'BBRI',
    },
    {
      sector: 'Energy',
      asOfDate,
      rsRatio: 98.4,
      rsMomentum: 103.1,
      netFlow5d: 145_000_000_000,
      netFlow20d: 280_000_000_000,
      flowIntensityPct: 8.7,
      quadrant: 'IMPROVING' as SectorQuadrant,
      constituentCount: 6,
      topEmiten: 'ADRO',
    },
    {
      sector: 'Infrastructure',
      asOfDate,
      rsRatio: 101.8,
      rsMomentum: 101.2,
      netFlow5d: 85_000_000_000,
      netFlow20d: 190_000_000_000,
      flowIntensityPct: 6.4,
      quadrant: 'LEADING' as SectorQuadrant,
      constituentCount: 5,
      topEmiten: 'TLKM',
    },
    {
      sector: 'Basic Materials',
      asOfDate,
      rsRatio: 102.1,
      rsMomentum: 97.5,
      netFlow5d: -45_000_000_000,
      netFlow20d: 110_000_000_000,
      flowIntensityPct: -3.2,
      quadrant: 'WEAKENING' as SectorQuadrant,
      constituentCount: 5,
      topEmiten: 'MDKA',
    },
    {
      sector: 'Industrials',
      asOfDate,
      rsRatio: 97.6,
      rsMomentum: 101.8,
      netFlow5d: 65_000_000_000,
      netFlow20d: 40_000_000_000,
      flowIntensityPct: 4.8,
      quadrant: 'IMPROVING' as SectorQuadrant,
      constituentCount: 4,
      topEmiten: 'ASII',
    },
    {
      sector: 'Consumer Non-Cyclical',
      asOfDate,
      rsRatio: 95.8,
      rsMomentum: 94.2,
      netFlow5d: -95_000_000_000,
      netFlow20d: -240_000_000_000,
      flowIntensityPct: -7.5,
      quadrant: 'LAGGING' as SectorQuadrant,
      constituentCount: 6,
      topEmiten: 'ICBP',
    },
    {
      sector: 'Healthcare',
      asOfDate,
      rsRatio: 93.4,
      rsMomentum: 92.1,
      netFlow5d: -38_000_000_000,
      netFlow20d: -90_000_000_000,
      flowIntensityPct: -5.1,
      quadrant: 'LAGGING' as SectorQuadrant,
      constituentCount: 3,
      topEmiten: 'KLBF',
    },
    {
      sector: 'Properties',
      asOfDate,
      rsRatio: 91.8,
      rsMomentum: 89.5,
      netFlow5d: -62_000_000_000,
      netFlow20d: -150_000_000_000,
      flowIntensityPct: -8.4,
      quadrant: 'LAGGING' as SectorQuadrant,
      constituentCount: 4,
      topEmiten: 'BSDE',
    },
    {
      sector: 'Technology',
      asOfDate,
      rsRatio: 89.2,
      rsMomentum: 87.4,
      netFlow5d: -115_000_000_000,
      netFlow20d: -380_000_000_000,
      flowIntensityPct: -14.2,
      quadrant: 'LAGGING' as SectorQuadrant,
      constituentCount: 3,
      topEmiten: 'GOTO',
    },
  ];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    const sectorParam = searchParams.get('sector')?.trim();

    const asOfDate = dateParam || sessionDateJakarta(new Date());

    let sectors: SectorRotationMetric[] = [];

    try {
      if (sectorParam) {
        const row = await getSectorRotationForSector(sectorParam);
        if (row) {
          sectors = [
            {
              sector: String(row.sector),
              asOfDate: String(row.trade_date),
              rsRatio: Number(row.rs_ratio),
              rsMomentum: Number(row.rs_momentum),
              netFlow5d: Number(row.net_flow_5d),
              netFlow20d: Number(row.net_flow_20d),
              flowIntensityPct: Number(row.flow_intensity_pct),
              quadrant: String(row.quadrant) as SectorQuadrant,
              constituentCount: Number(row.constituent_count || 0),
              topEmiten: row.top_emiten ? String(row.top_emiten) : undefined,
            },
          ];
        }
      } else {
        const rows = await getLatestSectorRotationSnapshots(asOfDate);
        if (rows && rows.length > 0) {
          sectors = rows.map((r) => ({
            sector: String(r.sector),
            asOfDate: String(r.trade_date),
            rsRatio: Number(r.rs_ratio),
            rsMomentum: Number(r.rs_momentum),
            netFlow5d: Number(r.net_flow_5d),
            netFlow20d: Number(r.net_flow_20d),
            flowIntensityPct: Number(r.flow_intensity_pct),
            quadrant: String(r.quadrant) as SectorQuadrant,
            constituentCount: Number(r.constituent_count || 0),
            topEmiten: r.top_emiten ? String(r.top_emiten) : undefined,
          }));
        }
      }
    } catch {
      // Database offline/unconfigured fallback
    }

    if (sectors.length === 0) {
      const defaults = getDefaultSectors(asOfDate);
      if (sectorParam) {
        const match = defaults.find(
          (s) => s.sector.toLowerCase() === sectorParam.toLowerCase()
        );
        sectors = match
          ? [match]
          : [
              {
                sector: sectorParam,
                asOfDate,
                rsRatio: 100,
                rsMomentum: 100,
                netFlow5d: 0,
                netFlow20d: 0,
                flowIntensityPct: 0,
                quadrant: 'SECTOR_NEUTRAL' as SectorQuadrant,
                constituentCount: 0,
              },
            ];
      } else {
        sectors = defaults;
      }
    }

    let confluence;
    if (sectorParam && sectors.length > 0) {
      confluence = evaluateSectorConfluence(sectors[0]);
    }

    return NextResponse.json({
      status: 'success',
      date: asOfDate,
      sectors,
      confluence,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}
