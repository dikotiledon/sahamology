import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitChronological, isCompleteHorizon, horizonSessions } from './walk-forward';

test('purged 80/20 split drops a 5-trading-day purge gap', () => {
  // 30 weekdays 2026-01-01 .. 2026-02-11 (all trading days; no holidays in range)
  const dates: string[] = [];
  const d = new Date(Date.UTC(2026, 0, 1));
  while (dates.length < 30) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const { cut, is, purged, oos } = splitChronological(dates, {
    isFraction: 0.8,
    purgeSessions: 5,
  });
  // cut = dates[23] = 2026-02-03 (Tue); OOS start = addTradingDays(cut, +5) = 2026-02-10.
  assert.equal(cut, dates[23]);
  assert.equal(is.length, 24);
  // gap = cut < d < OOS start → 4 trading days (Feb 4, 5, 6, 9)
  assert.deepEqual(purged, dates.slice(24, 28));
  // OOS = from_date >= 2026-02-10 → 2 days
  assert.deepEqual(oos, dates.slice(28));
  assert.deepEqual(oos, [dates[28], dates[29]]);
});

test('purge is calendar-based: a Friday cut pushes OOS past the weekend', () => {
  // 10 consecutive trading days from Monday 2026-01-05:
  // 05 06 07 08 09 | 12 13 14 15 16
  // cut = dates[7] (80% of 10 = 8 → index 7) = Thu 2026-01-15
  const dates = [
    '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
    '2026-01-12', '2026-01-13', '2026-01-14', '2026-01-15', '2026-01-16',
  ];
  const { cut, is, purged, oos } = splitChronological(dates, {
    isFraction: 0.8,
    purgeSessions: 5,
  });
  // cut = dates[7] = 2026-01-14 (Wed); OOS start = addTradingDays(cut, +5) = 2026-01-21.
  assert.equal(cut, '2026-01-14');
  assert.deepEqual(is, dates.slice(0, 8));
  // gap = dates strictly between 01-14 and 01-21 → 01-15, 01-16
  assert.deepEqual(purged, ['2026-01-15', '2026-01-16']);
  assert.deepEqual(oos, []);
});

test('purge is calendar-based: 5 trading days after the cut, not 5 positions', () => {
  // 5 trading days from Monday 2026-01-05: 05 06 07 08 09.
  // cut = index 3 (floor(5×0.8)−1) = Thu 2026-01-08.
  // 5 trading days after the cut: 09, 12, 13, 14, 15 → OOS start = 2026-01-15,
  // so Friday 2026-01-09 falls inside the purge gap.
  const prefix = [
    '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
  ];
  const { cut, purged, oos } = splitChronological(prefix, {
    isFraction: 0.8,
    purgeSessions: 5,
  });
  assert.equal(cut, '2026-01-08');
  assert.deepEqual(purged, ['2026-01-09']);
  assert.deepEqual(oos, []);
});

test('short series puts everything in IS with no purged/oos', () => {
  const dates = ['2026-01-01', '2026-01-02', '2026-01-03'];
  const { cut, is, purged, oos } = splitChronological(dates, {
    isFraction: 0.8,
    purgeSessions: 5,
  });
  assert.equal(cut, dates[1]);
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

test('isCompleteHorizon: 5 expected sessions all present', () => {
  // Signal Mon 2026-01-05, horizon 5 → sessions 01-06..01-12? No: addTradingDays(+5) of 01-05 = 01-12.
  // Expected sessions: 06, 07, 08, 09, 12.
  assert.equal(
    isCompleteHorizon('2026-01-05', ['2026-01-06','2026-01-07','2026-01-08','2026-01-09','2026-01-12'], 5),
    true
  );
});

test('isCompleteHorizon: truncated tail (missing sessions) is NOT complete', () => {
  // Only one forward bar loaded → unscored per plan §5.9.
  assert.equal(
    isCompleteHorizon('2026-01-05', ['2026-01-06'], 5),
    false
  );
});

test('isCompleteHorizon: weekend-skipping window with a holiday', () => {
  // Signal Fri 2026-01-02 → +5 trading days (Mon..Fri) = 01-09; but 01-08 is not an IDX holiday (assume none).
  // Sessions: 05, 06, 07, 08, 09.
  assert.equal(
    isCompleteHorizon('2026-01-02', ['2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09'], 5),
    true
  );
});

test('horizonSessions returns the exact trading-day window', () => {
  assert.deepEqual(
    horizonSessions('2026-01-02', 5),
    ['2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09']
  );
});
