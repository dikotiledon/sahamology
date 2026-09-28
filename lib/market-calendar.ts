import idxHolidays from './idx-holidays.json';

/**
 * IDX trading-session calendar helpers.
 *
 * Jakarta is UTC+7 with no daylight saving. All session dates are computed in
 * Asia/Jakarta, not the server's local timezone, so a UTC evening can already
 * be the next Jakarta session date.
 *
 * `lib/idx-holidays.json` is config, not code: it holds IDX non-trading days
 * (beyond weekends) as an array of "YYYY-MM-DD". 2026 is seeded from the
 * SKB 3 Menteri 2026 national-holiday calendar (weekday libur nasional only;
 * cuti bersama days are excluded because the exchange stays open on them).
 * A missing holiday only means the calendar falls back to weekend awareness,
 * which is safe — never guess a date into this file.
 */

const IDX_HOLIDAYS: ReadonlySet<string> = new Set(idxHolidays as string[]);

/** Format an instant as "YYYY-MM-DD" in Asia/Jakarta. */
export function jakartaYmd(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Whether a Jakarta calendar date (YYYY-MM-DD) is Saturday or Sunday. */
export function isWeekend(ymd: string): boolean {
  const [year, month, day] = ymd.split('-').map(Number);
  if (!year || !month || !day) return false;
  // Build in UTC to avoid local-timezone drift in the weekday lookup.
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/** Whether a Jakarta calendar date is a configured IDX holiday. */
export function isIdxHoliday(
  ymd: string,
  holidays: ReadonlySet<string> = IDX_HOLIDAYS
): boolean {
  return holidays.has(ymd);
}

/**
 * The last IDX trading session on or before `now`, as "YYYY-MM-DD" in
 * Asia/Jakarta. Rolls back over weekends and configured holidays.
 */
export function sessionDateJakarta(
  now: Date,
  holidays: ReadonlySet<string> = IDX_HOLIDAYS
): string {
  let cursor = new Date(now.getTime());
  let ymd = jakartaYmd(cursor);
  let guard = 0;

  while ((isWeekend(ymd) || isIdxHoliday(ymd, holidays)) && guard < 60) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
    ymd = jakartaYmd(cursor);
    guard += 1;
  }

  return ymd;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CURSOR_GUARD = 400;

/** Parse "YYYY-MM-DD" into a UTC Date at 00:00 (timezone-drift safe). */
function ymdToUtc(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Format a UTC Date at 00:00 back to "YYYY-MM-DD". */
function utcToYmd(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftYmd(ymd: string, deltaDays: number): string {
  return utcToYmd(new Date(ymdToUtc(ymd).getTime() + deltaDays * DAY_MS));
}

/**
 * The next IDX trading session strictly after `ymd` (skipping weekends and
 * configured holidays). Guards against a misconfigured all-holiday calendar.
 */
export function nextTradingDay(
  ymd: string,
  holidays: ReadonlySet<string> = IDX_HOLIDAYS
): string {
  let cursor = shiftYmd(ymd, 1);
  let guard = 0;
  while ((isWeekend(cursor) || isIdxHoliday(cursor, holidays)) && guard < CURSOR_GUARD) {
    cursor = shiftYmd(cursor, 1);
    guard += 1;
  }
  return cursor;
}

/**
 * The previous IDX trading session strictly before `ymd` (skipping weekends
 * and configured holidays). Guards against a misconfigured all-holiday calendar.
 */
export function prevTradingDay(
  ymd: string,
  holidays: ReadonlySet<string> = IDX_HOLIDAYS
): string {
  let cursor = shiftYmd(ymd, -1);
  let guard = 0;
  while ((isWeekend(cursor) || isIdxHoliday(cursor, holidays)) && guard < CURSOR_GUARD) {
    cursor = shiftYmd(cursor, -1);
    guard += 1;
  }
  return cursor;
}

/**
 * The session `n` trading days from `ymd`. `n = 0` is identity (even on a
 * weekend or holiday — it never normalizes). Positive walks forward, negative
 * walks backward; each step skips weekends and configured holidays.
 */
export function addTradingDays(
  ymd: string,
  n: number,
  holidays: ReadonlySet<string> = IDX_HOLIDAYS
): string {
  let cursor = ymd;
  const steps = Math.abs(n);
  for (let i = 0; i < steps; i += 1) {
    cursor = n > 0 ? nextTradingDay(cursor, holidays) : prevTradingDay(cursor, holidays);
  }
  return cursor;
}
