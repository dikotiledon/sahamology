import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isPointInTimeValid,
  selectPointInTimeSnapshot,
  type SnapshotStamp,
} from './periods';

/**
 * Leaf 1.1.2 — point-in-time qualification.
 *
 * The pre-audit plan modelled a 90-day publication lag over annual fiscal
 * periods. The live probe killed that model: the payload has no fiscal period
 * and no publication date, so there is no filing date to lag behind. What
 * remains is the CAPTURE timestamp, and it is a hard boundary.
 *
 * A signal dated D may only read a snapshot captured on or before D. Anything
 * later is lookahead — the single failure mode that silently inflates every
 * backtest, because a replay would be grading a decision with data that did
 * not exist when the decision was made.
 *
 * Dates are ISO `YYYY-MM-DD` strings compared lexicographically. That is safe
 * for that format and keeps this module free of any clock or timezone input.
 */

const snap = (emiten: string, asOf: string): SnapshotStamp => ({ emiten, asOf });

describe('isPointInTimeValid', () => {
  it('accepts a snapshot captured on the signal date itself', () => {
    assert.equal(isPointInTimeValid('2026-09-28', '2026-09-28'), true);
  });

  it('accepts an older snapshot', () => {
    assert.equal(isPointInTimeValid('2026-09-20', '2026-09-28'), true);
  });

  it('rejects a snapshot captured after the signal date (lookahead)', () => {
    assert.equal(isPointInTimeValid('2026-09-29', '2026-09-28'), false);
  });

  it('rejects a snapshot missing its capture date', () => {
    assert.equal(isPointInTimeValid(null, '2026-09-28'), false);
    assert.equal(isPointInTimeValid('', '2026-09-28'), false);
  });

  it('rejects a malformed capture date rather than guessing', () => {
    assert.equal(isPointInTimeValid('28-09-2026', '2026-09-28'), false);
    assert.equal(isPointInTimeValid('not-a-date', '2026-09-28'), false);
  });

  it('rejects a malformed signal date', () => {
    assert.equal(isPointInTimeValid('2026-09-28', 'nonsense'), false);
  });

  it('does not accept a full timestamp where a date is required', () => {
    // '2026-09-28T00:00:00Z' sorts after '2026-09-28' and would be a false
    // reject, so the date form is validated rather than blindly compared.
    assert.equal(isPointInTimeValid('2026-09-28T00:00:00Z', '2026-09-28'), false);
  });
});

describe('selectPointInTimeSnapshot', () => {
  it('returns null when nothing is knowable yet', () => {
    assert.equal(selectPointInTimeSnapshot([], '2026-09-28'), null);
  });

  it('picks the most recent snapshot on or before the signal date', () => {
    const rows = [
      snap('BBRI', '2026-09-20'),
      snap('BBRI', '2026-09-27'),
      snap('BBRI', '2026-09-28'),
      snap('BBRI', '2026-09-29'), // future — must be ignored
    ];
    assert.equal(selectPointInTimeSnapshot(rows, '2026-09-28')?.asOf, '2026-09-28');
  });

  it('falls back to the newest earlier snapshot when the day itself is missing', () => {
    const rows = [snap('BBRI', '2026-09-20'), snap('BBRI', '2026-09-26')];
    assert.equal(selectPointInTimeSnapshot(rows, '2026-09-28')?.asOf, '2026-09-26');
  });

  it('ignores entries for other emitens', () => {
    const rows = [snap('TLKM', '2026-09-28'), snap('BBRI', '2026-09-27')];
    assert.equal(selectPointInTimeSnapshot(rows, '2026-09-28', 'BBRI')?.asOf, '2026-09-27');
  });

  it('never returns a snapshot newer than the signal date, whatever the input order', () => {
    const rows = [
      snap('BBRI', '2026-10-01'),
      snap('BBRI', '2026-09-28'),
      snap('BBRI', '2026-11-15'),
    ];
    const chosen = selectPointInTimeSnapshot(rows, '2026-09-28');
    assert.equal(chosen?.asOf, '2026-09-28');
  });

  it('skips rows with an unusable capture date instead of throwing', () => {
    const rows = [snap('BBRI', 'oops'), snap('BBRI', '2026-09-27')];
    assert.equal(selectPointInTimeSnapshot(rows, '2026-09-28')?.asOf, '2026-09-27');
  });

  it('returns null when every candidate is strictly in the future', () => {
    const rows = [snap('BBRI', '2026-10-01')];
    assert.equal(selectPointInTimeSnapshot(rows, '2026-09-28'), null);
  });
});
