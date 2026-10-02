import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateRelativeStrength, summarizeSectorFlow } from './relative-strength';
import type { RadarAssessment } from './types';

describe('calculateRelativeStrength', () => {
  it('returns null for empty or short series (<21 bars)', () => {
    assert.equal(calculateRelativeStrength([], []), null);
    assert.equal(
      calculateRelativeStrength(
        Array(20).fill({ close: 1000 }),
        Array(21).fill({ close: 7000 })
      ),
      null
    );
  });

  it('returns null for non-finite or non-positive prices', () => {
    const bars1 = Array(21).fill({ close: 1000 });
    const bars2 = Array(21).fill({ close: 7000 });
    bars1[0] = { close: 0 }; // 20 sessions ago is 0
    assert.equal(calculateRelativeStrength(bars1, bars2), null);

    const bars3 = Array(21).fill({ close: 1000 });
    bars3[20] = { close: NaN }; // current is NaN
    assert.equal(calculateRelativeStrength(bars3, bars2), null);
  });

  it('correctly calculates outperformance when emiten gains more than IHSG', () => {
    // 21 bars: 20 sessions ago (index 0) = 1000, current (index 20) = 1100 (+10%)
    const emitenBars = Array(21).fill({ close: 1000 });
    emitenBars[20] = { close: 1100 };

    // IHSG: 20 sessions ago = 7000, current = 7140 (+2%)
    const ihsgBars = Array(21).fill({ close: 7000 });
    ihsgBars[20] = { close: 7140 };

    const result = calculateRelativeStrength(emitenBars, ihsgBars);
    assert.ok(result !== null);
    assert.equal(result.emitenReturn20dPct, 10);
    assert.equal(result.ihsgReturn20dPct, 2);
    assert.equal(result.outperforming, true);
    assert.ok(result.rsRatio > 1.0);
    assert.equal(result.perfSpreadPct, 8);
  });

  it('correctly calculates underperformance when emiten drops while IHSG gains', () => {
    const emitenBars = Array(21).fill({ close: 1000 });
    emitenBars[20] = { close: 950 }; // -5%

    const ihsgBars = Array(21).fill({ close: 7000 });
    ihsgBars[20] = { close: 7210 }; // +3%

    const result = calculateRelativeStrength(emitenBars, ihsgBars);
    assert.ok(result !== null);
    assert.equal(result.emitenReturn20dPct, -5);
    assert.equal(result.ihsgReturn20dPct, 3);
    assert.equal(result.outperforming, false);
    assert.ok(result.rsRatio < 1.0);
    assert.equal(result.perfSpreadPct, -8);
  });
});

describe('summarizeSectorFlow', () => {
  it('returns empty array on empty input', () => {
    assert.deepEqual(summarizeSectorFlow([]), []);
  });

  it('aggregates institutional capital flow and scores grouped by sector', () => {
    const assessments = [
      {
        emiten: 'BBCA',
        sector: 'Financials',
        score: 80,
        verdict: 'STRONG_ACCUMULATION',
        segmentation: {
          foreignNetValue: 50_000_000_000,
          domesticInstNetValue: 20_000_000_000,
        },
      },
      {
        emiten: 'BBRI',
        sector: 'Financials',
        score: 60,
        verdict: 'MODERATE_ACCUMULATION',
        segmentation: {
          foreignNetValue: -10_000_000_000,
          domesticInstNetValue: 5_000_000_000,
        },
      },
      {
        emiten: 'TLKM',
        sector: 'Infrastructure',
        score: 30,
        verdict: 'HEAVY_DISTRIBUTION',
        segmentation: {
          foreignNetValue: -30_000_000_000,
          domesticInstNetValue: -5_000_000_000,
        },
      },
    ] as unknown as RadarAssessment[];

    const sectors = summarizeSectorFlow(assessments);
    assert.equal(sectors.length, 2);

    // Financials should rank first (positive institutional flow)
    const fin = sectors[0];
    assert.equal(fin.sector, 'Financials');
    assert.equal(fin.emitenCount, 2);
    assert.equal(fin.totalNetInstitutionalValue, 65_000_000_000);
    assert.equal(fin.averageRadarScore, 70);
    assert.equal(fin.strongAccumCount, 1);
    assert.equal(fin.heavyDistCount, 0);

    // Infrastructure ranks second (negative flow)
    const infra = sectors[1];
    assert.equal(infra.sector, 'Infrastructure');
    assert.equal(infra.emitenCount, 1);
    assert.equal(infra.totalNetInstitutionalValue, -35_000_000_000);
    assert.equal(infra.averageRadarScore, 30);
    assert.equal(infra.strongAccumCount, 0);
    assert.equal(infra.heavyDistCount, 1);
  });
});
