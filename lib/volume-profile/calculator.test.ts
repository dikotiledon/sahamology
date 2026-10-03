import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateVolumeProfile } from './calculator';
import type { PriceBar } from './types';

test('calculateVolumeProfile returns fallback profile on empty or sparse bars (< 5)', () => {
  const result = calculateVolumeProfile({
    emiten: 'BBRI',
    bars: [],
    lookbackDays: 20,
  });

  assert.equal(result.emiten, 'BBRI');
  assert.equal(result.totalVolume, 0);
  assert.equal(result.pocPrice, 0);
  assert.equal(result.vahPrice, 0);
  assert.equal(result.valPrice, 0);
  assert.equal(result.bins.length, 0);
});

test('calculateVolumeProfile accurately computes Point of Control (POC)', () => {
  // Construct 10 bars where price repeatedly trades around 5000-5050 on high volume
  const bars: PriceBar[] = [];
  for (let i = 1; i <= 10; i++) {
    bars.push({
      date: `2026-09-${String(i).padStart(2, '0')}`,
      open: 5000,
      high: 5100,
      low: 4950,
      close: 5025,
      volume: i === 5 ? 50_000_000 : 10_000_000,
    });
  }

  const result = calculateVolumeProfile({
    emiten: 'BBRI',
    bars,
    lookbackDays: 10,
  });

  assert.ok(result.totalVolume > 0);
  assert.ok(result.bins.length > 0);
  assert.ok(result.pocPrice >= 4950 && result.pocPrice <= 5100);

  const pocBin = result.bins.find((b) => b.isPoc);
  assert.ok(pocBin !== undefined);
  assert.equal(pocBin.price, result.pocPrice);

  // POC must have highest volume among all bins
  for (const bin of result.bins) {
    assert.ok(pocBin.volume >= bin.volume);
  }
});

test('calculateVolumeProfile calculates 70% Value Area (VAH and VAL) enclosing POC', () => {
  const bars: PriceBar[] = [];
  for (let i = 1; i <= 15; i++) {
    bars.push({
      date: `2026-09-${String(i).padStart(2, '0')}`,
      open: 1000 + i * 10,
      high: 1100 + i * 10,
      low: 950 + i * 10,
      close: 1020 + i * 10,
      volume: 1_000_000,
    });
  }

  const result = calculateVolumeProfile({
    emiten: 'TLKM',
    bars,
    lookbackDays: 15,
  });

  assert.ok(result.vahPrice >= result.pocPrice);
  assert.ok(result.valPrice <= result.pocPrice);
  assert.ok(result.valueAreaVolumePct >= 68 && result.valueAreaVolumePct <= 75);

  const vaBins = result.bins.filter((b) => b.isValueArea);
  assert.ok(vaBins.length > 0);
  const vaSum = vaBins.reduce((acc, b) => acc + b.volume, 0);
  const vaRatio = (vaSum / result.totalVolume) * 100;
  assert.ok(vaRatio >= 68 && vaRatio <= 75);
});
