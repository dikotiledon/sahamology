/** A completed daily OHLC bar for one IDX session. */
export interface OhlcBar {
  /** "YYYY-MM-DD" Asia/Jakarta session date. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A bar is usable iff every price is finite and strictly positive, OHLC are
 * mutually consistent, and the date has "YYYY-MM-DD" shape. Dropped bars are
 * missing sessions — never interpolated, never zero-range candles.
 */
export function isUsableBar(bar: OhlcBar): boolean {
  const { open, high, low, close, date } = bar;
  return (
    [open, high, low, close].every((x) => Number.isFinite(x) && x > 0) &&
    high >= low &&
    high >= open &&
    high >= close &&
    low <= open &&
    low <= close &&
    DATE_RE.test(date)
  );
}
