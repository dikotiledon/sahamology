/**
 * Phase 4 leaf-1.0 — recorded macro feed probe.
 *
 * WHAT THIS IS: the evidence root G1 asserts against. It is a RECORDED artifact, not a
 * gate that re-fetches. Re-running the live API inside a gate would make the gate
 * non-deterministic and would burn the operator's personal Stockbit JWT on every
 * verification pass (the Phase 3 C35 lesson).
 *
 * WHAT IT PROVES (measured 2026-09-29 against the live API with the live JWT):
 *   - `IHSG`, `USDIDR`, `XAU`, `OIL` all resolve on the project's existing endpoints.
 *     There is NO `/indices` route — the index is addressed as an ordinary symbol.
 *     So Phase 4 needs zero new integration surface.
 *   - `GOLD` resolves to the IDX emiten "Visi Telekomunikasi Infrastruktur Tbk.", NOT
 *     a metal. It is permanently excluded (plan D13).
 *   - `USDIDR` is the MARKET FX rate ("US Dollar / Rupiah", type_company=FX), used
 *     here as the JISDOR proxy. The plan names the leg USDIDR everywhere precisely
 *     because the feed is not BI's published reference rate (plan D1).
 *
 * USAGE:
 *   npx tsx --tsconfig tsconfig.test.json scripts/record-macro-probe.ts
 *
 * Writes `artifacts/macro-probe.json`. Requires the live JWT in the database
 * (`session.stockbit_token`) or STOCKBIT_JWT_TOKEN in the environment. It NEVER
 * prints the token and never writes it to disk.
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';

const OUT = join(process.cwd(), 'artifacts', 'macro-probe.json');

/** The series this phase is allowed to capture. GOLD is deliberately absent (D13). */
const PROBE_SYMBOLS = ['IHSG', 'USDIDR', 'XAU', 'OIL', 'BRENT'] as const;

/** A symbol that must NOT be treated as a commodity — recorded so the gate can prove it. */
const PROBE_EXCLUDED = ['GOLD'] as const;

function loadDotEnvLocal(): void {
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawVal] = m;
      let value = rawVal.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local is optional.
  }
}

/**
 * Read the live Stockbit JWT. Never logged, never returned to the caller as output.
 * Prefers the database (the app's real path) and falls back to the env var.
 */
async function readLiveToken(): Promise<string> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const res = await pool.query<{ value: string }>(
        "SELECT value FROM session WHERE key = 'stockbit_token'",
      );
      const token = res.rows[0]?.value?.trim();
      if (token) return token;
    } finally {
      await pool.end();
    }
  }
  const env = process.env.STOCKBIT_JWT_TOKEN?.trim();
  if (env) return env;
  throw new Error('no Stockbit token in DATABASE_URL session or STOCKBIT_JWT_TOKEN');
}

interface SymbolProbe {
  symbol: string;
  /** HTTP status from /emitten/{symbol}/info. */
  status: number;
  /** Stockbit's own type: Index | FX | commodities | Saham | null when unresolved. */
  type: string | null;
  name: string | null;
  sector: string | null;
  /** A one-line note explaining why a symbol is excluded or surprising. */
  note?: string;
}

async function probeInfo(baseUrl: string, token: string, symbol: string): Promise<SymbolProbe> {
  try {
    const res = await fetch(`${baseUrl}/emitten/${symbol}/info`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        origin: 'https://stockbit.com',
        referer: 'https://stockbit.com/',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return { symbol, status: res.status, type: null, name: null, sector: null };
    const body = (await res.json()) as { data?: Record<string, unknown> };
    const d = body.data ?? {};
    return {
      symbol,
      status: res.status,
      type: typeof d.type_company === 'string' ? d.type_company : null,
      name: typeof d.name === 'string' ? d.name : null,
      sector: typeof d.sector === 'string' ? d.sector : null,
    };
  } catch (error) {
    return {
      symbol,
      status: 0,
      type: null,
      name: null,
      sector: null,
      note: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const baseUrl = 'https://exodus.stockbit.com';
  const token = await readLiveToken();

  const symbols: Record<string, SymbolProbe> = {};
  for (const symbol of PROBE_SYMBOLS) {
    symbols[symbol] = await probeInfo(baseUrl, token, symbol);
  }
  for (const symbol of PROBE_EXCLUDED) {
    const probe = await probeInfo(baseUrl, token, symbol);
    symbols[symbol] = {
      ...probe,
      note: 'EXCLUDED: resolves to an IDX emiten, not a commodity (plan D13)',
    };
  }

  // Migration floor: this phase builds on the Phase 3 set. Recording the check here
  // means leaf-1.0 G4 asserts a FACT observed at record time, not a re-run.
  //
  // The WSL dev host cannot always reach the published Postgres port (the port is
  // published on the Windows Docker host; in non-mirrored WSL it is not routable).
  // So the caller may supply the already-observed facts via MIGRATION_PROBE, and we
  // record WHERE each fact came from. An unchecked migration floor is never
  // silently reported as "false" — that once produced a false alarm.
  let migrations: Record<string, boolean> = {};
  let migrationsSource: 'database' | 'env-probe' | 'unobserved' = 'unobserved';
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const res = await pool.query<{ present: boolean; flow: boolean }>(
        "SELECT to_regclass('public.keystats_snapshot') IS NOT NULL AS present, " +
          "to_regclass('public.broker_flow_daily') IS NOT NULL AS flow",
      );
      migrations = {
        keystats_snapshot: res.rows[0]?.present === true,
        broker_flow_daily: res.rows[0]?.flow === true,
      };
      migrationsSource = 'database';
    } finally {
      await pool.end();
    }
  } else if (process.env.MIGRATION_PROBE) {
    // JSON object of {"<table>": bool} observed by the caller (e.g. `docker exec psql`).
    try {
      const parsed = JSON.parse(process.env.MIGRATION_PROBE) as Record<string, unknown>;
      for (const [table, present] of Object.entries(parsed)) {
        if (typeof present !== 'boolean') {
          throw new Error(`MIGRATION_PROBE.${table} is not a boolean`);
        }
        migrations[table] = present;
      }
      migrationsSource = 'env-probe';
    } catch (error) {
      throw new Error(
        `MIGRATION_PROBE is not valid JSON: ${error instanceof Error ? error.message : 'unknown'}`,
        { cause: error },
      );
    }
  } else {
    console.warn(
      'WARNING: no DATABASE_URL and no MIGRATION_PROBE; the migration floor was NOT observed.',
    );
  }

  const artifact = {
    recordedAt: new Date().toISOString(),
    baseUrl,
    note:
      'Recorded evidence for root gate G1. The FX leg is the MARKET USD/IDR rate used as the ' +
      'JISDOR proxy (plan D1); this is not BI\'s published reference rate.',
    symbols,
    migrations,
    migrationsSource,
  };

  mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
  writeFileSync(OUT, JSON.stringify(artifact, null, 2));

  // Print a summary WITHOUT the token.
  const summary = Object.entries(symbols)
    .map(([s, v]) => `${s}=${v.status}/${v.type ?? '-'}${v.note ? ' (excluded)' : ''}`)
    .join(' ');
  console.log(`Wrote ${OUT}`);
  console.log(`Recorded ${Object.keys(symbols).length} symbol(s): ${summary}`);
  console.log(`Migration floor: keystats_snapshot=${migrations.keystats_snapshot === true}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('record-macro-probe failed:', message);
  process.exit(1);
});
