/**
 * Backward-compatible re-export shim.
 *
 * Historically this file initialised the PostgREST client and exposed ~26
 * query helpers plus a raw `supabase` client. All query helpers now live in
 * `lib/db.ts` and are re-exported here unchanged so `app/**` callers keep
 * compiling and behaving identically.
 *
 * The two API routes that previously used the raw `supabase` client
 * (`app/api/emiten/flag/route.ts`, `app/api/watchlist/route.ts`) have dedicated
 * helpers in `lib/db.ts`; keep `supabase` as a documented null placeholder for
 * legacy imports until those call sites migrate.
 */

export * from './db';

/** @deprecated Use the helper functions in `lib/db.ts` instead of a raw client. */
export const supabase: null = null;
