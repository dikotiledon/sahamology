/**
 * Date-window chunking for the Stockbit historical-summary endpoint, which
 * accepts at most ~1 year of lookback per request. Chunks are inclusive and
 * calendar-based; callers dedupe bars by date after concatenation.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function toYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Split [start, end] into inclusive windows of at most `maxDays` calendar days.
 * The last chunk always ends on `end`. start > end yields an empty array.
 */
export function chunkDateRange(start: string, end: string, maxDays = 365): Array<[string, string]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
  const startMs = toUtc(start);
  const endMs = toUtc(end);
  if (startMs > endMs || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return [];

  const chunks: Array<[string, string]> = [];
  let cursor = startMs;
  while (cursor <= endMs) {
    const next = Math.min(cursor + (maxDays - 1) * DAY_MS, endMs);
    chunks.push([toYmd(cursor), toYmd(next)]);
    cursor = next + DAY_MS;
  }
  return chunks;
}

/**
 * Deduplicate historical-summary rows by date, keeping the first occurrence
 * (chunks are processed oldest-first, so earlier rows win on overlap).
 */
export function dedupeHistoryByDate<T extends { date?: string | number | null }>(
  rows: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const date = String(row.date ?? '').slice(0, 10);
    if (!date || seen.has(date)) continue;
    seen.add(date);
    out.push(row);
  }
  return out;
}
