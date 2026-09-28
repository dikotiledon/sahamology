import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitChronological } from './walk-forward';

test('purged 80/20 split drops a 5-session purge gap', () => {
  const dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    return d.toISOString().slice(0, 10);
  });
  const { cut, is, purged, oos } = splitChronological(dates, {
    isFraction: 0.8,
    purgeSessions: 5,
  });
  assert.equal(is.length, 24); // 80% of 30
  assert.equal(purged.length, 5); // the purge gap
  assert.equal(oos.length, 1); // 30 - 24 - 5
  assert.equal(cut, dates[23]);
  assert.deepEqual(purged, dates.slice(24, 29));
  assert.deepEqual(oos, [dates[29]]);
});

test('short series puts everything in IS with no purged/oos', () => {
  const dates = ['2026-01-01', '2026-01-02', '2026-01-03'];
  const { cut, is, purged, oos } = splitChronological(dates, {
    isFraction: 0.8,
    purgeSessions: 5,
  });
  assert.equal(cut, dates[1]); // floor(3*0.8)=2 sessions in IS
  assert.deepEqual(is, [dates[0], dates[1]]);
  assert.deepEqual(purged, [dates[2]]);
  assert.deepEqual(oos, []);
});

test('duplicates are collapsed and sorted', () => {
  const dates = ['2026-01-03', '2026-01-01', '2026-01-03', '2026-01-02'];
  const { is, purged, oos } = splitChronological(dates, {
    isFraction: 0.8,
    purgeSessions: 5,
  });
  assert.deepEqual(is, ['2026-01-01', '2026-01-02']);
  assert.deepEqual(purged, ['2026-01-03']);
  assert.deepEqual(oos, []);
});

test('empty series yields null cut and empty partitions', () => {
  const { cut, is, purged, oos } = splitChronological([], {
    isFraction: 0.8,
    purgeSessions: 5,
  });
  assert.equal(cut, null);
  assert.deepEqual(is, []);
  assert.deepEqual(purged, []);
  assert.deepEqual(oos, []);
});
