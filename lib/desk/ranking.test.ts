import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  STANCE_TIER,
  compareDeskRows,
  rankDeskRows,
  type DeskSortable,
} from './ranking';

const row = (over: Partial<DeskSortable> & Pick<DeskSortable, 'emiten' | 'stance'>): DeskSortable => ({
  asOf: '2026-01-05',
  rr: 1,
  ...over,
});

test('STANCE_TIER is frozen ENTER, WAIT, TAKE_PROFIT, INVALIDATED, AVOID', () => {
  assert.deepEqual(
    { ...STANCE_TIER },
    { ENTER: 0, WAIT: 1, TAKE_PROFIT: 2, INVALIDATED: 3, AVOID: 4 },
  );
});

test('ENTER ranks before WAIT before TAKE_PROFIT before INVALIDATED before AVOID', () => {
  const ranked = rankDeskRows([
    row({ emiten: 'AVOI', stance: 'AVOID', rr: 9 }),
    row({ emiten: 'INVA', stance: 'INVALIDATED', rr: 9 }),
    row({ emiten: 'TAKE', stance: 'TAKE_PROFIT', rr: 9 }),
    row({ emiten: 'WAIT', stance: 'WAIT', rr: 9 }),
    row({ emiten: 'ENTR', stance: 'ENTER', rr: 0.1 }),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.stance),
    ['ENTER', 'WAIT', 'TAKE_PROFIT', 'INVALIDATED', 'AVOID'],
  );
});

test('within ENTER, higher finite rr ranks first', () => {
  const ranked = rankDeskRows([
    row({ emiten: 'LOWX', stance: 'ENTER', rr: 1.2 }),
    row({ emiten: 'HIGH', stance: 'ENTER', rr: 2.4 }),
    row({ emiten: 'MIDD', stance: 'ENTER', rr: 1.8 }),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.emiten),
    ['HIGH', 'MIDD', 'LOWX'],
  );
});

test('null rr sorts after finite rr in the same tier, before a worse tier', () => {
  const ranked = rankDeskRows([
    row({ emiten: 'WAIT', stance: 'WAIT', rr: 3 }),
    row({ emiten: 'NULL', stance: 'ENTER', rr: null }),
    row({ emiten: 'FINI', stance: 'ENTER', rr: 0.5 }),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.emiten),
    ['FINI', 'NULL', 'WAIT'],
  );
});

test('NaN and Infinity rr are treated as null', () => {
  const ranked = rankDeskRows([
    row({ emiten: 'NANN', stance: 'ENTER', rr: Number.NaN }),
    row({ emiten: 'INFI', stance: 'ENTER', rr: Number.POSITIVE_INFINITY }),
    row({ emiten: 'NEGI', stance: 'ENTER', rr: Number.NEGATIVE_INFINITY }),
    row({ emiten: 'FINI', stance: 'ENTER', rr: 1 }),
  ]);
  assert.equal(ranked[0]?.emiten, 'FINI');
  assert.deepEqual(
    ranked.slice(1).map((r) => r.emiten).sort(),
    ['INFI', 'NANN', 'NEGI'],
  );
});

test('equal stance and rr tie-break by emiten localeCompare', () => {
  const ranked = rankDeskRows([
    row({ emiten: 'BBRI', stance: 'ENTER', rr: 2 }),
    row({ emiten: 'BBCA', stance: 'ENTER', rr: 2 }),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.emiten),
    ['BBCA', 'BBRI'],
  );
});

test('equal stance, rr and emiten tie-break by asOf', () => {
  const ranked = rankDeskRows([
    row({ emiten: 'BBCA', stance: 'ENTER', rr: 2, asOf: '2026-01-06' }),
    row({ emiten: 'BBCA', stance: 'ENTER', rr: 2, asOf: '2026-01-05' }),
  ]);
  assert.deepEqual(
    ranked.map((r) => r.asOf),
    ['2026-01-05', '2026-01-06'],
  );
});

test('comparator never returns NaN, including unknown stance', () => {
  const a = row({ emiten: 'AAAA', stance: 'ENTER', rr: Number.NaN });
  const b = { ...row({ emiten: 'BBBB', stance: 'ENTER' }), stance: 'UNKNOWN' as DeskSortable['stance'] };
  const c = row({ emiten: 'CCCC', stance: 'AVOID', rr: Number.POSITIVE_INFINITY });
  for (const pair of [
    [a, b],
    [b, c],
    [c, a],
    [a, a],
  ] as const) {
    const n = compareDeskRows(pair[0], pair[1]);
    assert.equal(Number.isNaN(n), false, `NaN comparing ${pair[0].emiten} vs ${pair[1].emiten}`);
    assert.equal(Number.isFinite(n), true);
  }
});

test('two distinct emiten/asOf rows never compare equal', () => {
  const a = row({ emiten: 'BBCA', stance: 'WAIT', rr: null, asOf: '2026-01-05' });
  const b = row({ emiten: 'BBRI', stance: 'WAIT', rr: null, asOf: '2026-01-05' });
  const c = row({ emiten: 'BBCA', stance: 'WAIT', rr: null, asOf: '2026-01-06' });
  assert.notEqual(compareDeskRows(a, b), 0);
  assert.notEqual(compareDeskRows(a, c), 0);
});

test('TAKE_PROFIT is retained after WAIT, not dropped', () => {
  const ranked = rankDeskRows([
    row({ emiten: 'WAIT', stance: 'WAIT', rr: 1 }),
    row({ emiten: 'TAKE', stance: 'TAKE_PROFIT', rr: 9 }),
  ]);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]?.stance, 'WAIT');
  assert.equal(ranked[1]?.stance, 'TAKE_PROFIT');
});

test('persistence is ignored even when present on the row', () => {
  const ranked = rankDeskRows([
    { ...row({ emiten: 'SPIK', stance: 'ENTER', rr: 1 }), persistenceTier: 'persistent' },
    { ...row({ emiten: 'HIGH', stance: 'ENTER', rr: 2 }), persistenceTier: 'spike' },
  ]);
  assert.deepEqual(
    ranked.map((r) => r.emiten),
    ['HIGH', 'SPIK'],
  );
});

test('rankDeskRows does not mutate the input array', () => {
  const input = [
    row({ emiten: 'WAIT', stance: 'WAIT', rr: 1 }),
    row({ emiten: 'ENTR', stance: 'ENTER', rr: 1 }),
  ];
  const copy = [...input];
  rankDeskRows(input);
  assert.deepEqual(input, copy);
});
