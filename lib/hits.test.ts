import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitR1, hitMax } from './hits';

test('max_harga above target is a hit', () => {
  assert.equal(hitR1({ max_harga: 500, target_realistis: 490 }), true);
  assert.equal(hitMax({ max_harga: 500, target_max: 490 }), true);
});

test('real_harga alone never counts without max_harga', () => {
  assert.equal(hitR1({ real_harga: 500, target_realistis: 490 }), false);
  assert.equal(hitMax({ real_harga: 500, target_max: 490 }), false);
});

test('missing max_harga is not a hit', () => {
  assert.equal(hitR1({ target_realistis: 490 }), false);
  assert.equal(hitMax({ target_max: 490 }), false);
});

test('NaN or non-finite values are not hits', () => {
  assert.equal(hitR1({ max_harga: Number.NaN, target_realistis: 490 }), false);
  assert.equal(hitR1({ max_harga: 500, target_realistis: Number.POSITIVE_INFINITY }), false);
});

test('equal max_harga and target is a hit (touch)', () => {
  assert.equal(hitR1({ max_harga: 490, target_realistis: 490 }), true);
  assert.equal(hitMax({ max_harga: 490, target_max: 490 }), true);
});
