import type {
  SectorTimeSeriesInput,
  SectorRotationMetric,
  SectorRotationConfluence,
  SectorQuadrant,
} from './types';

export function calculateSectorRelativeStrength(
  input: SectorTimeSeriesInput
): { rsRatio: number; rsMomentum: number } {
  const { constituentBars, ihsgBars } = input;

  if (!constituentBars || constituentBars.length === 0 || !ihsgBars || ihsgBars.length === 0) {
    return { rsRatio: 100, rsMomentum: 100 };
  }

  // Group constituent bars by date to compute daily sector average close
  const sectorByDate = new Map<string, { totalClose: number; count: number }>();
  for (const bar of constituentBars) {
    const existing = sectorByDate.get(bar.date);
    if (existing) {
      existing.totalClose += bar.close;
      existing.count += 1;
    } else {
      sectorByDate.set(bar.date, { totalClose: bar.close, count: 1 });
    }
  }

  const sectorDaily: Array<{ date: string; close: number }> = [];
  for (const [date, val] of sectorByDate.entries()) {
    sectorDaily.push({ date, close: val.totalClose / val.count });
  }

  sectorDaily.sort((a, b) => a.date.localeCompare(b.date));
  const sortedIhsg = [...ihsgBars].sort((a, b) => a.date.localeCompare(b.date));

  // Align dates
  const ihsgMap = new Map(sortedIhsg.map((b) => [b.date, b.close]));
  const aligned: Array<{ date: string; sectorClose: number; ihsgClose: number }> = [];

  for (const s of sectorDaily) {
    const ihsgClose = ihsgMap.get(s.date);
    if (ihsgClose != null) {
      aligned.push({ date: s.date, sectorClose: s.close, ihsgClose });
    }
  }

  if (aligned.length < 2) {
    return { rsRatio: 100, rsMomentum: 100 };
  }

  const latest = aligned[aligned.length - 1];

  // 20-day Lookback
  const k20 = Math.min(20, aligned.length - 1);
  const base20 = aligned[aligned.length - 1 - k20];
  const sectorReturn20 = ((latest.sectorClose - base20.sectorClose) / base20.sectorClose) * 100;
  const ihsgReturn20 = ((latest.ihsgClose - base20.ihsgClose) / base20.ihsgClose) * 100;
  const rsRatio = Math.round((100 + (sectorReturn20 - ihsgReturn20)) * 100) / 100;

  // 5-day Lookback (Momentum)
  const k5 = Math.min(5, aligned.length - 1);
  const base5 = aligned[aligned.length - 1 - k5];
  const sectorReturn5 = ((latest.sectorClose - base5.sectorClose) / base5.sectorClose) * 100;
  const ihsgReturn5 = ((latest.ihsgClose - base5.ihsgClose) / base5.ihsgClose) * 100;
  const rsMomentum = Math.round((100 + (sectorReturn5 - ihsgReturn5)) * 100) / 100;

  return { rsRatio, rsMomentum };
}

export function classifySectorQuadrant(params: {
  rsRatio: number;
  rsMomentum: number;
  netFlow5d: number;
}): SectorQuadrant {
  const { rsRatio, netFlow5d } = params;

  if (rsRatio === 100 && netFlow5d === 0) {
    return 'SECTOR_NEUTRAL';
  }

  if (rsRatio >= 100 && netFlow5d > 0) {
    return 'LEADING';
  }

  if (rsRatio >= 100 && netFlow5d <= 0) {
    return 'WEAKENING';
  }

  if (rsRatio < 100 && netFlow5d <= 0) {
    return 'LAGGING';
  }

  if (rsRatio < 100 && netFlow5d > 0) {
    return 'IMPROVING';
  }

  return 'SECTOR_NEUTRAL';
}

export function calculateSectorRotation(input: SectorTimeSeriesInput): SectorRotationMetric {
  const { sector, asOfDate, constituentBars } = input;

  const uniqueEmitens = Array.from(new Set(constituentBars.map((b) => b.emiten)));
  const constituentCount = uniqueEmitens.length;

  const { rsRatio, rsMomentum } = calculateSectorRelativeStrength(input);

  // Group by date descending
  const uniqueDatesDesc = Array.from(new Set(constituentBars.map((b) => b.date))).sort((a, b) =>
    b.localeCompare(a)
  );

  const dates5d = new Set(uniqueDatesDesc.slice(0, 5));
  const dates20d = new Set(uniqueDatesDesc.slice(0, 20));

  let netFlow5d = 0;
  let turnover5d = 0;
  let netFlow20d = 0;

  const emitenFlow5d = new Map<string, number>();

  for (const bar of constituentBars) {
    if (dates5d.has(bar.date)) {
      netFlow5d += bar.netInstitutionalBuy;
      turnover5d += bar.turnover;
      emitenFlow5d.set(
        bar.emiten,
        (emitenFlow5d.get(bar.emiten) || 0) + bar.netInstitutionalBuy
      );
    }
    if (dates20d.has(bar.date)) {
      netFlow20d += bar.netInstitutionalBuy;
    }
  }

  const flowIntensityPct =
    turnover5d > 0 ? Math.round((netFlow5d / turnover5d) * 10000) / 100 : 0;

  // Find top accumulated emiten in the sector
  let topEmiten: string | undefined;
  let maxFlow = -Infinity;
  for (const [emiten, flow] of emitenFlow5d.entries()) {
    if (flow > maxFlow && flow > 0) {
      maxFlow = flow;
      topEmiten = emiten;
    }
  }

  const quadrant = classifySectorQuadrant({ rsRatio, rsMomentum, netFlow5d });

  return {
    sector,
    asOfDate,
    rsRatio,
    rsMomentum,
    netFlow5d,
    netFlow20d,
    flowIntensityPct,
    quadrant,
    constituentCount,
    topEmiten,
  };
}

export function evaluateSectorConfluence(
  metric: SectorRotationMetric
): SectorRotationConfluence {
  const { sector, quadrant, rsRatio, netFlow5d } = metric;

  const isTailwind = quadrant === 'LEADING' || (quadrant === 'IMPROVING' && netFlow5d > 0);
  const isHeadwind = quadrant === 'LAGGING' || quadrant === 'WEAKENING';

  const flowBillions = Math.abs(netFlow5d / 1_000_000_000).toFixed(1);

  let summary: string;
  switch (quadrant) {
    case 'LEADING':
      summary = `Sektor ${sector} berada di kuadran LEADING dengan akumulasi institusi agresif (+Rp ${flowBillions}B 5d) dan outperformance relatif vs IHSG (RS: ${rsRatio.toFixed(1)}). Tailwind sektor kuat.`;
      break;
    case 'WEAKENING':
      summary = `Sektor ${sector} berada di kuadran WEAKENING dengan indikasi distribusi/profit-taking (-Rp ${flowBillions}B 5d) meskipun harga masih relatif outperform. Waspadai pelemahan momentum.`;
      break;
    case 'LAGGING':
      summary = `Sektor ${sector} berada di kuadran LAGGING dengan net outflow (-Rp ${flowBillions}B 5d) dan underperformance vs IHSG (RS: ${rsRatio.toFixed(1)}). Headwind sektor aktif.`;
      break;
    case 'IMPROVING':
      summary = `Sektor ${sector} berada di kuadran IMPROVING dengan akumulasi institusi (+Rp ${flowBillions}B 5d) saat harga masih terdiskon (fase bottom reversal).`;
      break;
    default:
      summary = `Sektor ${sector} berada dalam kondisi netral tanpa bias rotasi modal yang jelas.`;
      break;
  }

  return {
    sector,
    quadrant,
    isTailwind,
    isHeadwind,
    summary,
  };
}
