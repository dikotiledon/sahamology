/**
 * Normalize a value that may be a pg DATE column result (JS `Date` at local
 * midnight) or an already-formatted string into a stable "YYYY-MM-DD" string.
 *
 * WHY NOT `toISOString().slice(0,10)`: in a positive-offset timezone
 * (Asia/Jakarta is UTC+7), `new Date('2026-09-24')` is
 * `2026-09-23T17:00:00.000Z`, so the ISO slice returns "2026-09-23" — an
 * off-by-one calendar day. Use the Date's own calendar fields instead.
 */
export function ymdOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : s;
}
