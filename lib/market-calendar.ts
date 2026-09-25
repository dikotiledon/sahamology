import idxHolidays from './idx-holidays.json';

/**
 * IDX trading-session calendar helpers.
 *
 * Jakarta is UTC+7 with no daylight saving. All session dates are computed in
 * Asia/Jakarta, not the server's local timezone, so a UTC evening can already
 * be the next Jakarta session date.
 *
 * `lib/idx-holidays.json` is config, not code: it holds IDX non-trading days
 * (beyond weekends) as an array of "YYYY-MM-DD". Seed it from the official IDX
 * trading calendar for each year. The file ships empty rather than with
 * guessed dates — a missing holiday only means the calendar falls back to
 * weekend awareness, which is safe.
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
