import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { calculateVolumeAnomaly, type PriceBar } from './volume-anomaly';

describe('calculateVolumeAnomaly', () => {
  it('handles empty and short series', () => {
    const res = calculateVolumeAnomaly([]);
    assert.equal(res.volumeRatioToSma50, 0);
    assert.equal(res.isSilentAccumulation, false);

    const singleBar = calculateVolumeAnomaly([{ close: 1000, volume: 500 }]);
    assert.equal(singleBar.volumeRatioToSma50, 0);
    assert.equal(singleBar.isSilentAccumulation, false);
  });

  it('detects silent accumulation when volume surges 3.5x with compressed ATR', () => {
    // Generate 50 historical baseline bars with average volume 1,000,000 and typical range 50
    const bars: PriceBar[] = [];
    for (let i = 0; i < 50; i++) {
      bars.push({
        open: 1000,
        high: 1025,
        low: 975, // High - low = 50
        close: 1000,
        volume: 1_000_000,
      });
    }

    // Current bar: volume surges to 3,500,000 (3.5x), but price range is compressed to 20 (< 50)
    bars.push({
      open: 1000,
      high: 1010,
      low: 990, // Range = 20 (compression ratio 20 / 50 = 0.40)
      close: 1005,
      volume: 3_500_000,
    });

    const res = calculateVolumeAnomaly(bars);
    assert.equal(res.currentVolume, 3_500_000);
    assert.equal(res.volumeSma50, 1_000_000);
    assert.equal(res.volumeRatioToSma50, 3.5);
    assert.ok(res.priceVolatilityRatio < 0.5, `Expected compressed volatility, got ${res.priceVolatilityRatio}`);
    assert.equal(res.isSilentAccumulation, true);
  });

  it('rejects breakout days where volume surges but price volatility also expands', () => {
    // 50 historical bars with average range 50
    const bars: PriceBar[] = [];
    for (let i = 0; i < 50; i++) {
      bars.push({
        open: 1000,
        high: 1025,
        low: 975,
        close: 1000,
        volume: 1_000_000,
      });
    }

    // Current bar: volume surges 4x, but price swings violently (range 150 > 50, volatility ratio = 3.0)
    bars.push({
      open: 1000,
      high: 1150,
      low: 1000,
      close: 1140,
      volume: 4_000_000,
    });

    const res = calculateVolumeAnomaly(bars);
    assert.equal(res.volumeRatioToSma50, 4.0);
    assert.ok(res.priceVolatilityRatio > 2.0);
    assert.equal(res.isSilentAccumulation, false);
  });
});
