import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSectorRelativeStrength,
  classifySectorQuadrant,
  calculateSectorRotation,
  evaluateSectorConfluence,
} from './relative-strength';
import type { SectorTimeSeriesInput, SectorConstituentBar } from './types';

test('calculateSectorRelativeStrength computes RS ratio and momentum relative to IHSG', () => {
  // 25 dates
  const dates = Array.from({ length: 25 }, (_, i) => {
    const d = (i + 1).toString().padStart(2, '0');
    return `2026-09-${d}`;
  });

  // IHSG flat at 7000
  const ihsgBars = dates.map((date) => ({ date, close: 7000 }));

  // Sector moving from 1000 up to 1200 (+20%)
  const constituentBars: SectorConstituentBar[] = dates.map((date, idx) => ({
    emiten: 'BBRI',
    date,
    close: 1000 + idx * 8.33,
    volume: 1000000,
    turnover: 1000000000,
    netInstitutionalBuy: 50000000,
  }));

  const input: SectorTimeSeriesInput = {
    sector: 'Financials',
    asOfDate: '2026-09-25',
    constituentBars,
    ihsgBars,
  };

  const rs = calculateSectorRelativeStrength(input);
  assert.ok(rs.rsRatio > 100, 'Sector outperforming IHSG must have RS ratio > 100');
  assert.ok(rs.rsMomentum >= 100, 'Positive 5d momentum must be >= 100');
});

test('classifySectorQuadrant correctly maps quadrants based on RS and institutional flow', () => {
  assert.equal(
    classifySectorQuadrant({ rsRatio: 105, rsMomentum: 102, netFlow5d: 5000000000 }),
    'LEADING'
  );
  assert.equal(
    classifySectorQuadrant({ rsRatio: 105, rsMomentum: 98, netFlow5d: -2000000000 }),
    'WEAKENING'
  );
  assert.equal(
    classifySectorQuadrant({ rsRatio: 94, rsMomentum: 95, netFlow5d: -4000000000 }),
    'LAGGING'
  );
  assert.equal(
    classifySectorQuadrant({ rsRatio: 94, rsMomentum: 103, netFlow5d: 3000000000 }),
    'IMPROVING'
  );
  assert.equal(
    classifySectorQuadrant({ rsRatio: 100, rsMomentum: 100, netFlow5d: 0 }),
    'SECTOR_NEUTRAL'
  );
});

test('calculateSectorRotation aggregates multi-constituent flows and identifies top emiten', () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03'];
  const ihsgBars = dates.map((date) => ({ date, close: 7200 }));

  const constituentBars: SectorConstituentBar[] = [
    // BBRI in Financials
    {
      emiten: 'BBRI',
      date: '2026-10-03',
      close: 5000,
      volume: 100000,
      turnover: 500000000,
      netInstitutionalBuy: 300000000,
    },
    // BBCA in Financials
    {
      emiten: 'BBCA',
      date: '2026-10-03',
      close: 10000,
      volume: 50000,
      turnover: 500000000,
      netInstitutionalBuy: 100000000,
    },
  ];

  const rotation = calculateSectorRotation({
    sector: 'Financials',
    asOfDate: '2026-10-03',
    constituentBars,
    ihsgBars,
  });

  assert.equal(rotation.sector, 'Financials');
  assert.equal(rotation.constituentCount, 2);
  assert.equal(rotation.netFlow5d, 400000000);
  assert.equal(rotation.topEmiten, 'BBRI');
  assert.ok(rotation.flowIntensityPct > 0);
});

test('evaluateSectorConfluence flags tailwind for LEADING and headwind for LAGGING sectors', () => {
  const tailwind = evaluateSectorConfluence({
    sector: 'Energy',
    asOfDate: '2026-10-03',
    rsRatio: 108,
    rsMomentum: 104,
    netFlow5d: 15000000000,
    netFlow20d: 35000000000,
    flowIntensityPct: 18.5,
    quadrant: 'LEADING',
    constituentCount: 8,
  });

  assert.equal(tailwind.isTailwind, true);
  assert.equal(tailwind.isHeadwind, false);
  assert.match(tailwind.summary, /LEADING/);

  const headwind = evaluateSectorConfluence({
    sector: 'Properties',
    asOfDate: '2026-10-03',
    rsRatio: 91,
    rsMomentum: 88,
    netFlow5d: -8000000000,
    netFlow20d: -22000000000,
    flowIntensityPct: -12.3,
    quadrant: 'LAGGING',
    constituentCount: 6,
  });

  assert.equal(headwind.isTailwind, false);
  assert.equal(headwind.isHeadwind, true);
  assert.match(headwind.summary, /LAGGING/);
});
