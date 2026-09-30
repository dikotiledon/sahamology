import { jakartaYmd, isIdxHoliday, isWeekend } from '../market-calendar';
import type { JobCalendar } from './types';

export type { JobCalendar } from './types';

export function resolveJobCalendar(now: Date): JobCalendar {
  const wall = jakartaYmd(now);
  if (isWeekend(wall)) return { kind: 'skip', reason: 'weekend', wall };
  if (isIdxHoliday(wall)) return { kind: 'skip', reason: 'holiday', wall };
  return { kind: 'run', today: wall, wall };
}
