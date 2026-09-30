/**
 * Coerce pg NUMERIC strings and other unknown scalars to a finite number.
 *
 * node-postgres leaves OID 1700 as a string. Lexicographic comparison of those
 * strings is a trap (`'1100' <= '950'` is true). Callers must coerce at the
 * journal/price readers, never via a pool-wide parser (plan D17).
 */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function roundRMultiple(n: number): number {
  return Number(n.toFixed(4));
}
