import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  jakartaYmd,
  isWeekend,
  isIdxHoliday,
  sessionDateJakarta,
  nextTradingDay,
  prevTradingDay,
  addTradingDays,
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

test('holiday set is honored and seeded with 2026 SKB weekday libur nasional', () => {
  // Seeded libur nasional (weekdays only — exchange closed).
  assert.equal(isIdxHoliday('2026-01-01'), true); // Tahun Baru (Thu)
  assert.equal(isIdxHoliday('2026-08-17'), true); // Kemerdekaan (Mon)
  assert.equal(isIdxHoliday('2026-12-25'), true); // Natal (Fri)
  // Cuti bersama is NOT an exchange holiday — IDX stays open.
  assert.equal(isIdxHoliday('2026-02-16'), false); // cuti bersama Imlek (Mon)
  assert.equal(isIdxHoliday('2026-03-20'), false); // cuti bersama Idul Fitri (Fri)
  // Weekends are handled separately, not duplicated in the holiday set.
  assert.equal(isIdxHoliday('2026-03-21'), false); // Idul Fitri (Sat)
  // Injectable override still works for tests.
  assert.equal(isIdxHoliday('2026-12-25', new Set(['2026-12-25'])), true);
});

test('sessionDateJakarta rolls back over weekends and holidays', () => {
  const holidays = new Set(['2026-09-25']); // Friday treated as holiday.
  // Saturday 2026-09-26 rolls back: Fri 25 is a holiday, Thu 24 is a session.
  assert.equal(sessionDateJakarta(utc('2026-09-26T03:00:00Z'), holidays), '2026-09-24');
  // Normal Thursday evening Jakarta (Friday already) with no holiday stays Friday.
  assert.equal(sessionDateJakarta(utc('2026-09-24T18:00:00Z')), '2026-09-25');
});

test('nextTradingDay skips weekend', () => {
  assert.equal(nextTradingDay('2026-09-25'), '2026-09-28'); // Fri → Mon
});

test('nextTradingDay skips seeded holiday', () => {
  assert.equal(nextTradingDay('2025-12-31'), '2026-01-02'); // Wed → Thu(holiday) → Fri
});

test('prevTradingDay walks backward over a weekend', () => {
  assert.equal(prevTradingDay('2026-09-28'), '2026-09-25'); // Mon → Fri
});

test('addTradingDays +5 from a Friday lands five sessions later', () => {
  assert.equal(addTradingDays('2026-09-25', 5), '2026-10-02');
});

test('addTradingDays 0 is identity on a session', () => {
  assert.equal(addTradingDays('2026-09-25', 0), '2026-09-25');
});

test('addTradingDays 0 is identity even on a weekend', () => {
  assert.equal(addTradingDays('2026-09-26', 0), '2026-09-26'); // Saturday
});

test('addTradingDays negative walks backward over weekend', () => {
  assert.equal(addTradingDays('2026-09-28', -1), '2026-09-25');
});

test('addTradingDays negative crosses a holiday', () => {
  assert.equal(addTradingDays('2026-01-02', -1), '2025-12-31'); // Fri → Thu(holiday) → Wed
});
