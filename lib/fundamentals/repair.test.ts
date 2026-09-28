/**
 * The repair contract, asserted rather than assumed.
 *
 * `lib/micro/repair.test.ts` exists for Phase 2 because of audit finding F2: a
 * degraded capture permanently removed a signal from the only population that
 * could validate the phase. These tests exist for the same reason one phase
 * over, and they assert the specific way the D14 scope split can go wrong —
 * the fundamentals repair reaching into the micro scope, or into a column that
 * restates a decision.
 *
 * The gate at leaf-1.3.1 G3 is a string check over this module, so these tests
 * are what make the module's SQL trustworthy rather than merely present.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FUNDAMENTALS_REPAIR_SELECT_SQL,
  FUNDAMENTALS_REPAIR_UPDATE_SQL,
  FUNDAMENTALS_REPAIRABLE_COLUMNS,
  FUNDAMENTALS_IMMUTABLE_COLUMNS,
  REPAIR_SCOPES,
  SCOPE_FLAG,
  flagForScope,
  repairBlocker,
} from './repair';

const writeable = new Set<string>(FUNDAMENTALS_REPAIRABLE_COLUMNS);
const immutable = new Set<string>(FUNDAMENTALS_IMMUTABLE_COLUMNS);

test('the two repairable sets do not overlap', () => {
  // A column that is both "we may write this" and "we may never write this" is
  // a contradiction, and the resolution would be whichever branch ran last.
  for (const column of writeable) {
    assert.equal(
      immutable.has(column),
      false,
      `${column} is listed as both writeable and immutable`,
    );
  }
});

test('every decision column is immutable to the fundamentals repair', () => {
  // The promise a repair makes: it completes a capture, it never restates a
  // decision. If any of these could be written, a re-captured reading would
  // silently rewrite the stance the row already recorded.
  for (const column of [
    'harga',
    'ara',
    'arb',
    'bandar',
    'stance',
    'target_max',
    'target_realistis',
  ]) {
    assert.ok(
      immutable.has(column),
      `${column} is not protected by the fundamentals repair`,
    );
    assert.equal(
      writeable.has(column),
      false,
      `${column} is writeable by the fundamentals repair`,
    );
  }
});

test('the fundamentals repair cannot clear the micro capture flag', () => {
  // D11: the two captures fail independently. Clearing `capture_incomplete`
  // from the fundamentals scope would report a micro gap as repaired when no
  // micro fetch ever ran — a row that looks complete and is not.
  assert.ok(immutable.has('capture_incomplete'));
  assert.equal(writeable.has('capture_incomplete'), false);
});

test('the fundamentals repair cannot clear any micro column', () => {
  for (const column of [
    'accdist_overall',
    'accdist_top1',
    'accdist_top3',
    'accdist_top5',
    'accdist_avg',
    'broker_total_buyer',
    'broker_total_seller',
    'broker_p',
  ]) {
    assert.ok(immutable.has(column), `${column} is not protected from the fundamentals scope`);
  }
});

test('the SELECT keys on fundamentals_incomplete, not the micro flag', () => {
  assert.match(FUNDAMENTALS_REPAIR_SELECT_SQL, /fundamentals_incomplete\s*=\s*true/);
  // A stray `capture_incomplete` in this query would pull every micro-degraded
  // row into the fundamentals repair queue.
  assert.equal(
    /capture_incomplete/.test(FUNDAMENTALS_REPAIR_SELECT_SQL),
    false,
    'the fundamentals SELECT references the micro flag',
  );
});

test('the UPDATE writes exactly one column and it is the fundamentals flag', () => {
  const set = FUNDAMENTALS_REPAIR_UPDATE_SQL.match(/SET\s+([\s\S]*?)\s+WHERE/i);
  assert.ok(set, 'the UPDATE has no SET clause');

  const assigned = set[1]
    .split(',')
    .map((part) => part.split('=')[0].trim())
    .filter(Boolean);

  assert.deepEqual(
    assigned,
    ['fundamentals_incomplete'],
    'the fundamentals UPDATE writes columns beyond the fundamentals flag',
  );
});

test('the UPDATE cannot clear a decision column', () => {
  const set = FUNDAMENTALS_REPAIR_UPDATE_SQL.match(/SET\s+([\s\S]*?)\s+WHERE/i);
  assert.ok(set);
  for (const column of immutable) {
    // `capture_incomplete` is a substring of `fundamentals_incomplete`, so the
    // SET clause is checked as a whole rather than by substring.
    assert.equal(
      new RegExp(`SET[\\s\\S]*?\\b${column}\\s*=`).test(FUNDAMENTALS_REPAIR_UPDATE_SQL),
      false,
      `the fundamentals UPDATE can write the immutable column ${column}`,
    );
  }
});

test('the UPDATE is a no-op unless a snapshot exists for that exact date', () => {
  // Without this guard, a retry that fails to fetch would still clear the flag
  // and mark the row repaired on the strength of a re-fetch that did nothing.
  assert.match(FUNDAMENTALS_REPAIR_UPDATE_SQL, /EXISTS\s*\(/i);
  assert.match(FUNDAMENTALS_REPAIR_UPDATE_SQL, /FROM\s+keystats_snapshot/i);
  // And the match must be exact, not a range: a snapshot from another day
  // would be a lookahead.
  assert.match(FUNDAMENTALS_REPAIR_UPDATE_SQL, /k\.as_of\s*=\s*q\.from_date/);
  assert.equal(
    /as_of\s*(<|>|<=|>=|BETWEEN)/i.test(FUNDAMENTALS_REPAIR_UPDATE_SQL),
    false,
    'the snapshot lookup is a range or inequality, which permits a lookahead',
  );
});

test('the UPDATE keys on both the date and the emiten', () => {
  // Keying on the date alone would clear every emiten's row for that session on
  // the strength of one emiten's successful capture.
  assert.match(FUNDAMENTALS_REPAIR_UPDATE_SQL, /q\.from_date\s*=\s*\$1/);
  assert.match(FUNDAMENTALS_REPAIR_UPDATE_SQL, /q\.emiten\s*=\s*\$2/);
});

test('the SELECT is bounded, so a repair run cannot lock the table', () => {
  assert.match(FUNDAMENTALS_REPAIR_SELECT_SQL, /LIMIT\s+\$1/);
});

test('each scope maps to its own flag and never the other one', () => {
  assert.equal(flagForScope('micro'), 'capture_incomplete');
  assert.equal(flagForScope('fundamentals'), 'fundamentals_incomplete');
  // The two must differ, or the scope split is decorative.
  assert.notEqual(SCOPE_FLAG.micro, SCOPE_FLAG.fundamentals);
});

test('an unknown scope is rejected rather than defaulting', () => {
  // Defaulting would send an unknown request to one of the two real scopes and
  // clear the wrong flag.
  assert.throws(() => flagForScope('everything' as never), /unknown repair scope/);
});

test('the scope list contains exactly the two supported scopes', () => {
  assert.deepEqual([...REPAIR_SCOPES], ['micro', 'fundamentals']);
  for (const scope of REPAIR_SCOPES) {
    assert.ok(SCOPE_FLAG[scope], `scope ${scope} has no flag mapping`);
  }
});

test('an unrepairable row reports a reason instead of a default', () => {
  // The vendor publishes no dated KeyStats history, so a past row whose capture
  // failed cannot be backfilled honestly. The correct outcome is a stated
  // blocker, not a fabricated reading.
  const blocker = repairBlocker(
    'no-snapshot-after-retry',
    'vendor serves a current snapshot only; a past session cannot be backfilled',
  );
  assert.equal(blocker.reason, 'no-snapshot-after-retry');
  assert.ok(blocker.detail.length > 0, 'a blocker must say why');
});
