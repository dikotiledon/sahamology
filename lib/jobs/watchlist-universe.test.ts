import assert from 'node:assert/strict';
import { test } from 'node:test';
import { partitionWatchlistUniverse, resolveEmitensToAnalyze } from './watchlist-universe';

/**
 * The Stockbit "All Watchlist" can hold non-IDX instruments (forex pairs such
 * as USDIDR). Those can never produce an IDX stock_queries signal, so the
 * daily job must not treat them as emitens — and must report the reason
 * instead of silently burning a trading day.
 */

test('splits IDX emitens from non-IDX instruments', () => {
  const result = partitionWatchlistUniverse([
    { symbol: 'BBCA' },
    { symbol: 'USDIDR' },
    { company_code: 'TLKM' },
  ]);
  assert.deepEqual(result.emitens, ['BBCA', 'TLKM']);
  assert.deepEqual(result.skipped, [{ symbol: 'USDIDR', reason: 'non-idx' }]);
});

test('an empty or fully-skipped universe reports zero emitens', () => {
  assert.deepEqual(partitionWatchlistUniverse([]).emitens, []);
  assert.deepEqual(partitionWatchlistUniverse([{ symbol: 'USDIDR' }]).emitens, []);
  assert.equal(partitionWatchlistUniverse([{ symbol: 'USDIDR' }]).skipped.length, 1);
});

test('an item with no usable symbol is skipped, never emitted', () => {
  const result = partitionWatchlistUniverse([
    { symbol: '' },
    { symbol: '   ' },
    {},
    { symbol: 'BBRI' },
  ]);
  assert.deepEqual(result.emitens, ['BBRI']);
  assert.equal(result.skipped.length, 3);
  for (const s of result.skipped) assert.equal(s.reason, 'no-symbol');
});

test('symbols are trimmed, uppercased, and de-duplicated', () => {
  const result = partitionWatchlistUniverse([
    { symbol: ' bbca ' },
    { symbol: 'BBCA' },
    { company_code: 'Bbra' },
  ]);
  assert.deepEqual(result.emitens, ['BBCA', 'BBRA']);
});

test('a known non-IDX instrument code is skipped as non-idx', () => {
  const result = partitionWatchlistUniverse([{ symbol: 'USDIDR' }, { symbol: 'EURUSD' }]);
  assert.deepEqual(result.emitens, []);
  assert.equal(result.skipped.length, 2);
});

test('fallback emitens apply only when the watchlist yields no IDX emitens', () => {
  // Watchlist has a usable IDX emiten and no fallback configured: watchlist wins.
  const watchlistOnly = resolveEmitensToAnalyze([{ symbol: 'BBCA' }], '');
  assert.deepEqual(watchlistOnly.emitens, ['BBCA']);
  assert.equal(watchlistOnly.source, 'stockbit-watchlist');
  assert.deepEqual(watchlistOnly.fallbackEmitens, []);

  // Watchlist has only a non-IDX item and a fallback is configured: fallback wins.
  const fallbackOnly = resolveEmitensToAnalyze([{ symbol: 'USDIDR' }], 'TLKM, ASII , ');
  assert.deepEqual(fallbackOnly.emitens, ['TLKM', 'ASII']);
  assert.equal(fallbackOnly.source, 'env-fallback');
  assert.equal(fallbackOnly.fallbackEmitens.length, 2);

  // Watchlist has only a non-IDX item and no fallback: nothing to analyze.
  const neither = resolveEmitensToAnalyze([{ symbol: 'USDIDR' }], '');
  assert.deepEqual(neither.emitens, []);
  assert.equal(neither.source, 'none');
});

test('watchlist and fallback emitens are unioned, de-duplicated, when both exist', () => {
  const result = resolveEmitensToAnalyze([{ symbol: 'BBCA' }], 'BBCA, TLKM');
  assert.deepEqual(result.emitens, ['BBCA', 'TLKM']);
  assert.equal(result.source, 'union');
});

test('no watchlist and no fallback yields an empty universe', () => {
  const result = resolveEmitensToAnalyze([], '');
  assert.deepEqual(result.emitens, []);
  assert.equal(result.source, 'none');
});
