-- Migration: Disable Row Level Security on emiten_flags for direct PostgreSQL access.
--
-- Migration 005 enabled RLS on emiten_flags (a Supabase-era pattern). With the
-- PostgREST client removed, the application now connects directly as the database
-- owner. The table owner would bypass non-FORCED RLS by default, but disabling RLS
-- makes the intent explicit and avoids breakage when the app connects as a
-- different role (e.g. a restricted DATABASE_URL user).

ALTER TABLE IF EXISTS emiten_flags DISABLE ROW LEVEL SECURITY;

-- Drop the legacy public/authenticated policies that only made sense through PostgREST.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'emiten_flags') THEN
        DROP POLICY IF EXISTS "Allow public read access" ON emiten_flags;
        DROP POLICY IF EXISTS "Allow authenticated insert/update" ON emiten_flags;
    END IF;
END
$$;
