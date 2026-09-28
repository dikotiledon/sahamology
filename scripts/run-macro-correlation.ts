/**
 * Phase 4 leaf 1.2.2 — the macro correlation study.
 *
 * D2 ORDERS THIS BEFORE ANY THRESHOLD EXISTS. The question is not "what z-score
 * looks scary" but "does an adverse macro regime actually predict a worse
 * forward result for an IDX signal?" If the answer is no, the honest output is
 * a published null result and NO clause gets a bound. A risk-off number invented
 * before measuring is the "armed-looking hollow clause" Phase 3 deleted
 * (`GOING_CONCERN`), and the whole point of this leaf is to not repeat it.
 *
 * WHAT IT PUBLISHES, IN ORDER:
 *   1. The realised distribution of each clause's trailing z, so a bound can be
 *      read off a QUANTILE rather than picked.
 *   2. The forward result for signals observed in each regime bucket, split by
 *      sector — because a macro leg that predicts nothing overall may still
 *      predict something for the sector that is actually exposed to it.
 *   3. Only then, a candidate bound, and ONLY if the data supports one.
 *
 * EVERY BOUND IS OPTIONAL. A clause with no measurable relationship is emitted
 * with `candidate: null` and stays unarmed. That is a result, not a failure.
 *
 * SECTOR EXPOSURE IS MEASURED, NEVER ASSUMED (leaf gate 1.2.2:G3). There is no
 * hardcoded sector-to-commodity table anywhere in this file: the study derives
 * each sector's commodity beta by regressing its forward return on the
 * commodity legs' returns over the same window, and reports the coefficient. A
 * sector with too few observations reports `null`, which is what the classifier
 * treats as "no measured exposure" — never a default assumption.
 *
 * POINT-IN-TIME THROUGHOUT. A signal dated D is paired only with the macro bar
 * at or before D, and its forward return is measured from D forward. A study
 * that peeked would report a relationship that does not exist and would then be
 * frozen into a threshold.
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { trailingZScore, REGIME_WINDOW } from '../lib/macro/classifier';
import { MACRO_CLAUSES, type MacroClause, type MacroSeries } from '../lib/macro/types';

/** Forward horizons, in sessions, that the study reports against. */
const FORWARD_HORIZONS = [5, 10, 20] as const;

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/** Quantile of a SORTED array, linear interpolation. */
export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const QUANTILE_LEVELS = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95] as const;

/**
 * Pearson correlation, or null when either side has no dispersion.
 *
 * A correlation against a constant series is not a weak correlation, it is
 * undefined, and reporting a number there would be a fabricated result.
 */
export function pearson(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length < 3) return null;
  const ma = mean(a);
  const mb = mean(b);
  if (ma === null || mb === null) return null;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/** Least-squares slope of y on x, or null when x has no dispersion. */
export function slope(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  const mx = mean(x);
  const my = mean(y);
  if (mx === null || my === null) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < x.length; i += 1) {
    num += (x[i] - mx) * (y[i] - my);
    den += (x[i] - mx) ** 2;
  }
  if (den === 0) return null;
  return num / den;
}

/** One macro series with its dates, so a signal can be joined point-in-time. */
export interface MacroSeriesInput {
  symbol: MacroSeries;
  /** `YYYY-MM-DD` per close, oldest first, same length as `closes`. */
  dates: string[];
  closes: number[];
}

export interface Signal {
  emiten: string;
  sector: string | null;
  /** The session the decision was made on. */
  signalDate: string;
  /** The price the decision was made at. */
  entryPrice: number;
  /**
   * Closes for this emiten, oldest first, with `signalDates` giving each one's
   * date. The forward return is measured from the signal session forward.
   */
  signalDates: string[];
  closes: number[];
}

export interface StudyInput {
  macro: MacroSeriesInput[];
  signals: Signal[];
  measuredFrom: string;
  /** The z quantile that defines the adverse bucket. */
  adverseQuantile?: number;
  /** Minimum observations before a bound may be proposed at all. */
  minObservations?: number;
}

export interface ClauseStudy {
  clause: MacroClause;
  legs: MacroSeries[];
  observations: number;
  quantiles: Record<string, number>;
  forward: Array<{
    horizon: number;
    adverseN: number;
    adverseMean: number | null;
    baselineN: number;
    baselineMean: number | null;
    delta: number | null;
  }>;
  candidate: { bound: number; quantile: string; measuredFrom: string } | null;
  noBoundReason: string | null;
}

/** Trailing z at every index, aligned to the bar index; null before WINDOW. */
export function zSeriesFor(closes: number[]): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    out.push(i < REGIME_WINDOW ? null : trailingZScore(closes.slice(0, i + 1), REGIME_WINDOW));
  }
  return out;
}

/** The newest index whose date is <= `asOf`, or -1. This is the PIT join. */
export function indexAtOrBefore(dates: string[], asOf: string): number {
  let found = -1;
  for (let i = 0; i < dates.length; i += 1) {
    if (dates[i] <= asOf) found = i;
    else break;
  }
  return found;
}

/** Simple return from `from` to `from + horizon`, or null if unavailable. */
function forwardReturn(signal: Signal, horizon: number): number | null {
  const start = indexAtOrBefore(signal.signalDates, signal.signalDate);
  if (start < 0) return null;
  const end = start + horizon;
  if (end >= signal.closes.length) return null;
  const a = signal.closes[start];
  const b = signal.closes[end];
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return b / a - 1;
}

/** The leg's own return over the same window, aligned by date. */
function legReturn(leg: MacroSeriesInput, asOf: string, horizon: number): number | null {
  const start = indexAtOrBefore(leg.dates, asOf);
  if (start < 0) return null;
  const end = start + horizon;
  if (end >= leg.closes.length) return null;
  const a = leg.closes[start];
  const b = leg.closes[end];
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
  return b / a - 1;
}

const LEGS_FOR: Record<MacroClause, MacroSeries[]> = {
  USD_IDR_DETERIORATING: ['USDIDR'],
  IHSG_BROAD_WEAKNESS: ['IHSG'],
  SECTOR_COMMODITY_ADVERSE: ['XAU', 'OIL', 'BRENT'],
};

/** Which tail is adverse: FX weakness is a HIGH z, index weakness a LOW z. */
const DIRECTION: Record<MacroClause, 1 | -1> = {
  USD_IDR_DETERIORATING: 1,
  IHSG_BROAD_WEAKNESS: -1,
  SECTOR_COMMODITY_ADVERSE: 1,
};

export function runStudy(input: StudyInput): {
  clauses: ClauseStudy[];
  sectorExposure: Array<{ sector: string; n: number; exposures: Record<string, number | null> }>;
  sampleWarnings: string[];
} {
  const adverseQ = input.adverseQuantile ?? 0.1;
  const minObs = input.minObservations ?? 30;
  const sampleWarnings: string[] = [];

  // Precompute each leg's z series, once, keyed by symbol.
  const zBySymbol = new Map<MacroSeries, Array<number | null>>();
  const seriesBySymbol = new Map<MacroSeries, MacroSeriesInput>();
  for (const m of input.macro) {
    zBySymbol.set(m.symbol, zSeriesFor(m.closes));
    seriesBySymbol.set(m.symbol, m);
  }

  const clauses: ClauseStudy[] = MACRO_CLAUSES.map((clause) => {
    const legs = LEGS_FOR[clause];
    const direction = DIRECTION[clause];

    // (z, signal) pairs, each joined POINT-IN-TIME.
    const pairs: Array<{ z: number; signal: Signal }> = [];
    for (const leg of legs) {
      const zs = zBySymbol.get(leg);
      const series = seriesBySymbol.get(leg);
      if (!zs || !series) continue;
      for (const signal of input.signals) {
        const idx = indexAtOrBefore(series.dates, signal.signalDate);
        if (idx < 0) continue;
        const z = zs[idx];
        if (z === null) continue;
        pairs.push({ z, signal });
      }
    }

    const zs = pairs.map((p) => p.z).sort((a, b) => a - b);
    const quantiles: Record<string, number> = {};
    for (const level of QUANTILE_LEVELS) {
      const q = quantile(zs, level);
      if (q !== null) quantiles[`p${Math.round(level * 100)}`] = Number(q.toFixed(4));
    }

    const signed = (z: number) => (direction === 1 ? z : -z);
    const cutLevel = direction === 1 ? 1 - adverseQ : adverseQ;
    const cut = quantile(zs, cutLevel);
    const cutSigned = cut === null ? null : signed(cut);

    const forward: ClauseStudy['forward'] = [];
    for (const horizon of FORWARD_HORIZONS) {
      const adverse: number[] = [];
      const baseline: number[] = [];
      for (const p of pairs) {
        const ret = forwardReturn(p.signal, horizon);
        if (ret === null) continue;
        if (cutSigned !== null && signed(p.z) >= cutSigned) adverse.push(ret);
        else baseline.push(ret);
      }
      const am = mean(adverse);
      const bm = mean(baseline);
      forward.push({
        horizon,
        adverseN: adverse.length,
        adverseMean: am === null ? null : Number(am.toFixed(6)),
        baselineN: baseline.length,
        baselineMean: bm === null ? null : Number(bm.toFixed(6)),
        delta: am === null || bm === null ? null : Number((am - bm).toFixed(6)),
      });
    }

    let candidate: ClauseStudy['candidate'] = null;
    let noBoundReason: string | null = null;
    const shortest = forward[0];
    if (pairs.length < minObs) {
      noBoundReason = `only ${pairs.length} observation(s); ${minObs} required before a bound may be proposed`;
    } else if (cut === null) {
      noBoundReason = 'the z distribution has no usable quantile';
    } else if (!shortest || shortest.adverseN === 0 || shortest.baselineN === 0) {
      noBoundReason =
        `the adverse bucket is empty at the shortest horizon ` +
        `(adverse=${shortest?.adverseN ?? 0}, baseline=${shortest?.baselineN ?? 0})`;
    } else if (shortest.delta === null || shortest.delta >= 0) {
      noBoundReason =
        `the adverse bucket is not worse than its baseline at the shortest horizon ` +
        `(delta=${shortest.delta}); a bound here would be unfalsifiable`;
    } else {
      candidate = {
        bound: Number(cut.toFixed(4)),
        quantile: `p${Math.round(cutLevel * 100)}`,
        measuredFrom: input.measuredFrom,
      };
    }

    return {
      clause,
      legs,
      observations: pairs.length,
      quantiles,
      forward,
      candidate,
      noBoundReason,
    };
  });

  // Sector commodity exposure, measured by regression on the SAME window.
  const sectors = [...new Set(input.signals.map((s) => s.sector).filter((s): s is string => !!s))];
  const horizon = 10;
  const sectorExposure = sectors
    .map((sector) => {
      const rows = input.signals.filter((s) => s.sector === sector);
      const exposures: Record<string, number | null> = {};
      for (const leg of ['XAU', 'OIL', 'BRENT'] as const) {
        const series = seriesBySymbol.get(leg);
        const xs: number[] = [];
        const ys: number[] = [];
        if (series) {
          for (const s of rows) {
            const ret = forwardReturn(s, horizon);
            const legRet = legReturn(series, s.signalDate, horizon);
            if (ret === null || legRet === null) continue;
            xs.push(legRet);
            ys.push(ret);
          }
        }
        // Below three paired observations a slope is noise, not an exposure.
        exposures[leg] = xs.length >= 3 ? Number((slope(xs, ys) as number).toFixed(4)) : null;
      }
      return { sector, n: rows.length, exposures };
    })
    .sort((a, b) => b.n - a.n);

  const distinctDates = new Set(input.signals.map((s) => s.signalDate));
  if (input.signals.length < minObs) {
    sampleWarnings.push(
      `only ${input.signals.length} signal(s) in the sample; a shipped threshold needs at least ${minObs}`,
    );
  }
  if (distinctDates.size < 5) {
    sampleWarnings.push(
      `the sample spans only ${distinctDates.size} distinct signal date(s); a macro regime needs a calendar to vary over`,
    );
  }

  return { clauses, sectorExposure, sampleWarnings };
}

// ---------------------------------------------------------------------------
// Live runner
// ---------------------------------------------------------------------------

interface MacroRow {
  symbol: string;
  bar_date: string;
  close: number;
}

interface StockQueryRow {
  emiten: string;
  sector: string | null;
  from_date: string;
  harga: number;
}

interface PriceRow {
  emiten: string;
  date: string;
  close: number;
}

/** Read the captured macro bars and the signal rows, both from the database. */
async function readFromDb(): Promise<{
  macro: MacroSeriesInput[];
  signals: Signal[];
}> {
  const { query } = await import('../lib/db');

  const macroRows = (await query(
    'SELECT symbol, bar_date, close FROM macro_snapshot ORDER BY symbol, bar_date',
  )).rows as unknown as MacroRow[];

  const bySymbol = new Map<string, MacroSeriesInput>();
  for (const row of macroRows) {
    const date = String(row.bar_date).slice(0, 10);
    const close = Number(row.close);
    if (!Number.isFinite(close)) continue;
    const entry = bySymbol.get(row.symbol);
    if (entry) {
      entry.dates.push(date);
      entry.closes.push(close);
    } else {
      bySymbol.set(row.symbol, { symbol: row.symbol as MacroSeries, dates: [date], closes: [close] });
    }
  }

  const signals: Signal[] = [];
  const rows = (await query(
    `SELECT DISTINCT ON (emiten, from_date) emiten, sector, from_date, harga
     FROM stock_queries
     WHERE status = 'success'
     ORDER BY emiten, from_date DESC`,
  )).rows as unknown as StockQueryRow[];

  // Price history is optional: without it every forward return is null and the
  // study publishes a distribution with no forward outcome, which is still
  // honest but must be labelled as such.
  const prices: PriceRow[] = await query(
    'SELECT emiten, date, close FROM price_history ORDER BY emiten, date',
  )
    .then((r) => r.rows as unknown as PriceRow[])
    .catch(() => [] as PriceRow[]);
  const priceBy = new Map<string, PriceRow[]>();
  for (const p of prices) {
    const key = p.emiten;
    const list = priceBy.get(key) ?? [];
    list.push({ emiten: p.emiten, date: String(p.date).slice(0, 10), close: Number(p.close) });
    priceBy.set(key, list);
  }

  for (const row of rows) {
    const dates = (priceBy.get(row.emiten) ?? []).map((p) => p.date);
    const closes = (priceBy.get(row.emiten) ?? []).map((p) => p.close);
    signals.push({
      emiten: row.emiten,
      sector: row.sector,
      signalDate: String(row.from_date).slice(0, 10),
      entryPrice: Number(row.harga),
      signalDates: dates,
      closes,
    });
  }

  return { macro: [...bySymbol.values()], signals };
}

/**
 * `--example` runs the study against a SYNTHETIC series with a known planted
 * relationship, so the gate can verify the machinery without a live database
 * and without the study silently passing on an empty sample.
 */
function exampleInput(): StudyInput {
  const dates: string[] = [];
  for (let i = 0; i < 260; i += 1) {
    dates.push(new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
  }
  // A random-walk leg plus a planted regime effect, so the study has something
  // real to find: returns are WORSE when the trailing z is high.
  const closes: number[] = [];
  let price = 16000;
  const legDates = dates;
  for (let i = 0; i < legDates.length; i += 1) {
    const zs = trailingZScore(closes.length > 0 ? [...closes, price] : [price], REGIME_WINDOW);
    const regime = zs !== null && zs > 1 ? -0.004 : 0.0005;
    price = price * (1 + regime + (Math.sin(i) + Math.cos(i * 3)) * 0.0012);
    closes.push(Number(price.toFixed(2)));
  }

  const signalDates = legDates.slice(0, 200);
  const signalCloses = closes.slice(0, 200);
  const signals: Signal[] = [];
  for (let i = REGIME_WINDOW; i < 190; i += 4) {
    signals.push({
      emiten: `SYNTH${i}`,
      sector: i % 2 === 0 ? 'Energi' : 'Keuangan',
      signalDate: signalDates[i],
      entryPrice: signalCloses[i],
      signalDates,
      closes: signalCloses,
    });
  }
  return {
    macro: [{ symbol: 'USDIDR', dates: legDates, closes }],
    signals,
    measuredFrom: 'synthetic-fixture:not-a-measurement',
  };
}

/**
 * Build the study input from an exported JSON snapshot.
 *
 * `--data <file>` reads `{macro, signals, prices}` as produced by the psql
 * export. This exists because the dev host cannot always reach the published
 * Postgres port, while `docker exec psql` always can — so the data is exported
 * there and the study runs from the file. It also makes a study run
 * reproducible: the exact input that produced an artifact can be kept.
 */
function fromDataFile(path: string): StudyInput {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    macro: Array<{ symbol: string; d: string; c: number }>;
    signals: Array<{ emiten: string; sector: string | null; d: string; h: number }>;
    prices: Array<{ emiten: string; d: string; c: number }>;
  };

  const bySymbol = new Map<string, { symbol: MacroSeries; dates: string[]; closes: number[] }>();
  for (const row of raw.macro ?? []) {
    if (!Number.isFinite(row.c)) continue;
    const entry = bySymbol.get(row.symbol) ?? {
      symbol: row.symbol as MacroSeries,
      dates: [],
      closes: [],
    };
    entry.dates.push(row.d);
    entry.closes.push(row.c);
    bySymbol.set(row.symbol, entry);
  }

  const priceBy = new Map<string, { dates: string[]; closes: number[] }>();
  for (const p of raw.prices ?? []) {
    const entry = priceBy.get(p.emiten) ?? { dates: [], closes: [] };
    entry.dates.push(p.d);
    entry.closes.push(p.c);
    priceBy.set(p.emiten, entry);
  }

  const signals: Signal[] = (raw.signals ?? []).map((s) => {
    const px = priceBy.get(s.emiten) ?? { dates: [], closes: [] };
    return {
      emiten: s.emiten,
      sector: s.sector,
      signalDate: s.d,
      entryPrice: s.h,
      signalDates: px.dates,
      closes: px.closes,
    };
  });

  const first = [...bySymbol.values()][0];
  return {
    macro: [...bySymbol.values()],
    signals,
    measuredFrom: `macro_snapshot@${first?.dates[0] ?? 'empty'}..${first?.dates[first.dates.length - 1] ?? 'empty'}`,
  };
}

async function main(): Promise<void> {
  const isExample = process.argv.includes('--example');
  const dataArg = process.argv.indexOf('--data');
  const dataPath = dataArg >= 0 ? process.argv[dataArg + 1] : null;
  let input: StudyInput;
  if (isExample) {
    input = exampleInput();
  } else if (dataPath) {
    input = fromDataFile(dataPath);
  } else {
    const { macro, signals } = await readFromDb();
    input = {
      macro,
      signals,
      measuredFrom: `macro_snapshot@${macro[0]?.dates[0] ?? 'empty'}..${macro[0]?.dates[macro[0].dates.length - 1] ?? 'empty'}`,
    };
  }

  const result = runStudy(input);
  const armed = result.clauses.filter((c) => c.candidate !== null);

  const artifact = {
    generatedAt: new Date().toISOString(),
    mode: isExample ? 'example' : dataPath ? 'exported' : 'live',
    sample: {
      signals: input.signals.length,
      distinctSignalDates: new Set(input.signals.map((s) => s.signalDate)).size,
      macroSeries: input.macro.map((m) => ({
        symbol: m.symbol,
        bars: m.closes.length,
        first: m.dates[0] ?? null,
        last: m.dates[m.dates.length - 1] ?? null,
      })),
    },
    clauses: result.clauses,
    sectorExposure: result.sectorExposure,
    sampleWarnings: result.sampleWarnings,
    threshold: {
      /**
       * Frozen bounds, populated ONLY from a measured candidate. Every emitted
       * bound carries the `measuredFrom` that produced it; a clause with no
       * candidate is emitted as null so the classifier leaves it unarmed.
       */
      measuredFrom: armed.length > 0 ? input.measuredFrom : null,
      bounds: Object.fromEntries(
        result.clauses.map((c) => [
          c.clause,
          c.candidate
            ? { bound: c.candidate.bound, quantile: c.candidate.quantile, measuredFrom: c.candidate.measuredFrom }
            : null,
        ]),
      ),
    },
  };

  const outDir = join(process.cwd(), 'artifacts');
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, isExample ? 'macro-correlation.example.json' : 'macro-correlation.json');
  writeFileSync(path, JSON.stringify(artifact, null, 2));

  console.log(`mode=${artifact.mode} signals=${input.signals.length} dates=${artifact.sample.distinctSignalDates}`);
  for (const c of result.clauses) {
    const cut = c.candidate ? `ARM z>=${c.candidate.bound} (${c.candidate.quantile})` : `UNARMED (${c.noBoundReason})`;
    const d5 = c.forward[0];
    console.log(
      `  ${c.clause}: n=${c.observations} ${cut}` +
        (d5 ? ` | h${d5.horizon} adverse=${d5.adverseN}@${d5.adverseMean} base=${d5.baselineN}@${d5.baselineMean} delta=${d5.delta}` : ''),
    );
  }
  for (const w of result.sampleWarnings) console.log(`  WARNING: ${w}`);
  console.log(`ARMED_CLAUSES=${armed.length}/${result.clauses.length}`);
  console.log(`WROTE ${path}`);
}

// Run only when executed directly. A test imports this module for `runStudy`
// and must not trigger a database read just by importing it.
const isDirectRun =
  process.argv[1] !== undefined && /run-macro-correlation\.(ts|js|mjs)$/.test(process.argv[1]);
if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error('macro correlation study failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
