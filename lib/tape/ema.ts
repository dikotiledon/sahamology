export const EMA_PERIOD = 20;
export const EMA_ALPHA = 2 / (EMA_PERIOD + 1); // 2/21

/**
 * TA-Lib EMA: SMA seed of the first `period` values, then
 * EMA[t] = EMA[t-1] + α*(value[t] - EMA[t-1]).
 * Null until index period-1. Non-finite inputs poison the tail.
 */
export function emaSeries(values: number[], period: number = EMA_PERIOD): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (!Number.isInteger(period) || period < 1 || values.length < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i += 1) {
    if (!Number.isFinite(values[i])) return out;
    sum += values[i];
  }

  const alpha = 2 / (period + 1);
  let ema = sum / period;
  out[period - 1] = ema;

  for (let i = period; i < values.length; i += 1) {
    const x = values[i];
    if (!Number.isFinite(x)) break;
    ema = ema + alpha * (x - ema);
    out[i] = ema;
  }
  return out;
}

/** Last finite EMA value, or null when the series is too short. */
export function emaLast(values: number[], period: number = EMA_PERIOD): number | null {
  const series = emaSeries(values, period);
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = series[i];
    if (v !== null) return v;
  }
  return null;
}
