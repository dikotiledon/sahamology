import { atrWilder } from './atr';
import { emaLast } from './ema';
import { detectPatterns, type PatternName } from './patterns';
import { isUsableBar, type OhlcBar } from './ohlc';

export type { OhlcBar, PatternName };

export const MIN_BARS = 21; // 1 prev close + 14 TR for ATR + 20 closes for EMA; slope needs 21

export interface TapeSnapshot {
  ok: boolean;
  reason: string;
  asOf: string;
  barsUsed: number;
  atr: number | null;
  ema20: number | null;
  ema20Prev: number | null;
  trendOk: boolean;
  pattern: PatternName | null;
  completedDate: string | null;
}

export interface TapeSnapshotArgs {
  bars: OhlcBar[];
  asOf: string;
  liveIncompleteToday: boolean;
  bandar: number;
  todayBandar: string | null;
  priorBandar: string[];
}

/**
 * Build the tape view the G3/G4 evaluator consumes.
 *
 * Lookahead discipline: only bars with date <= asOf are used; when
 * liveIncompleteToday is true, bars with date === asOf (today's running,
 * incomplete candle) are excluded too.
 */
export function buildTapeSnapshot(args: TapeSnapshotArgs): TapeSnapshot {
  const { bars, asOf, liveIncompleteToday, bandar, todayBandar, priorBandar } = args;

  const filtered = bars
    .filter((b) => b.date <= asOf)
    .filter((b) => (liveIncompleteToday ? b.date < asOf : true))
    .filter(isUsableBar)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const atr = atrWilder(filtered);
  const closes = filtered.map((b) => b.close);
  const ema20 = emaLast(closes);
  const ema20Prev = emaLast(closes.slice(0, -1));

  const barsUsed = filtered.length;
  const completedDate = filtered.length > 0 ? filtered[filtered.length - 1].date : null;

  if (barsUsed < MIN_BARS || atr === null || ema20 === null || ema20Prev === null) {
    return {
      ok: false,
      reason: `Tape tidak cukup (${barsUsed} sesi selesai, butuh ${MIN_BARS})`,
      asOf,
      barsUsed,
      atr,
      ema20,
      ema20Prev,
      trendOk: false,
      pattern: null,
      completedDate,
    };
  }

  const last = filtered[filtered.length - 1];
  const trendOk = last.close >= ema20 && ema20 >= ema20Prev;
  const sameBandarStreak = Boolean(todayBandar) && priorBandar.includes(todayBandar as string);
  const pattern = detectPatterns({
    bar: last,
    prev: filtered[filtered.length - 2],
    bandar,
    atr,
    ema20,
    sameBandarStreak,
  });

  return {
    ok: true,
    reason: 'Tape valid',
    asOf,
    barsUsed,
    atr,
    ema20,
    ema20Prev,
    trendOk,
    pattern: pattern.name,
    completedDate,
  };
}
