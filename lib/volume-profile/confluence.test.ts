import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVolumeProfileConfluence } from './confluence';
import type { VolumeProfileResult } from './types';

const MOCK_PROFILE: VolumeProfileResult = {
  emiten: 'BBRI',
  asOfDate: '2026-10-02',
  lookbackDays: 20,
  totalVolume: 100_000_000,
  pocPrice: 5000,
  vahPrice: 5200,
  valPrice: 4800,
  valueAreaVolumePct: 70,
  bins: [
    { price: 4750, volume: 5_000_000, volumePct: 5, isPoc: false, isValueArea: false, isHvn: false, isLvn: true },
    { price: 4800, volume: 15_000_000, volumePct: 15, isPoc: false, isValueArea: true, isHvn: true, isLvn: false },
    { price: 5000, volume: 40_000_000, volumePct: 40, isPoc: true, isValueArea: true, isHvn: true, isLvn: false },
    { price: 5100, volume: 10_000_000, volumePct: 10, isPoc: false, isValueArea: true, isHvn: false, isLvn: true },
    { price: 5200, volume: 20_000_000, volumePct: 20, isPoc: false, isValueArea: true, isHvn: true, isLvn: false },
    { price: 5300, volume: 10_000_000, volumePct: 10, isPoc: false, isValueArea: false, isHvn: false, isLvn: false },
  ],
  hvnShelves: [4800, 5000, 5200],
  lvnVoids: [4750, 5100],
};

test('evaluateVolumeProfileConfluence detects AT_POC_SUPPORT when entry aligns with POC', () => {
  const result = evaluateVolumeProfileConfluence({
    profile: MOCK_PROFILE,
    plannedEntry: 5000,
  });

  assert.equal(result.status, 'AT_POC_SUPPORT');
  assert.equal(result.isEntryAtHvnShelf, true);
  assert.equal(result.pocDistancePct, 0);
  assert.ok(result.summary.includes('POC'));
});

test('evaluateVolumeProfileConfluence flags IN_LOW_VOLUME_VOID when entry lands on LVN void', () => {
  const result = evaluateVolumeProfileConfluence({
    profile: MOCK_PROFILE,
    plannedEntry: 5100,
  });

  assert.equal(result.status, 'IN_LOW_VOLUME_VOID');
  assert.equal(result.isEntryInLvnVoid, true);
  assert.ok(result.summary.includes('Void'));
});

test('evaluateVolumeProfileConfluence detects ABOVE_VALUE_AREA when entry breaks out past VAH', () => {
  const result = evaluateVolumeProfileConfluence({
    profile: MOCK_PROFILE,
    plannedEntry: 5350,
  });

  assert.equal(result.status, 'ABOVE_VALUE_AREA');
  assert.ok(result.pocDistancePct > 5);
});
