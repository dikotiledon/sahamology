import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  jakartaYmd,
  isWeekend,
  isIdxHoliday,
  sessionDateJakarta,
} from './market-calendar';

// Fixed instants expressed in UTC.
const utc = (iso: string): Date => new Date(iso);

test('jakartaYmd crosses the day boundary at UTC+7', () => {
  // 2026-09-24 17:30 UTC = 2026-09-25 00:30 Asia/Jakarta.
  assert.equal(jakartaYmd(utc('2026-09-24T17:30:00Z')), '2026-09-25');
  // Same instant in the evening Jakarta side stays the earlier date.
  assert.equal(jakartaYmd(utc('2026-09-24T10:00:00Z')), '2026-09-24');
});

test('weekend detection', () => {
  assert.equal(isWeekend('2026-09-26'), true); // Saturday
  assert.equal(isWeekend('2026-09-27'), true); // Sunday
  assert.equal(isWeekend('2026-09-25'), false); // Friday
  assert.equal(isWeekend('not-a-date'), false);
});

test('holiday set is honored and empty by default', () => {
  assert.equal(isIdxHoliday('2026-12-25'), false);
  assert.equal(isIdxHoliday('2026-12-25', new Set(['2026-12-25'])), true);
});

test('sessionDateJakarta rolls back over weekends and holidays', () => {
  const holidays = new Set(['2026-09-25']); // Friday treated as holiday.
  // Saturday 2026-09-26 rolls back: Fri 25 is a holiday, Thu 24 is a session.
  assert.equal(sessionDateJakarta(utc('2026-09-26T03:00:00Z'), holidays), '2026-09-24');
  // Normal Thursday evening Jakarta (Friday already) with no holiday stays Friday.
  assert.equal(sessionDateJakarta(utc('2026-09-24T18:00:00Z')), '2026-09-25');
});
