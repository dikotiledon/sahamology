#!/usr/bin/env node

/**
 * PostgreSQL Migration Runner (native `pg`, no Supabase/PostgREST).
 *
 * Runs SQL migration files from the supabase/ directory in sequential order
 * against a PostgreSQL database reachable via DATABASE_URL. Tracks applied
 * migrations in a `schema_migrations` table with an MD5 checksum so the run
 * is idempotent and detects modified-but-already-applied files.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@localhost:5432/sahamology node scripts/run-migrations.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

// Load .env.local if it exists (local development convenience).
const envPath = path.join(__dirname, '..', '.env.local');
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([^#=]+?)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
} catch {
  // .env.local might not exist; that is fine.
}

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase');

function calculateChecksum(content) {
  return crypto.createHash('md5').update(content, 'utf8').digest('hex');
}

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name TEXT UNIQUE NOT NULL,
      executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      checksum TEXT,
      execution_time_ms INTEGER
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_schema_migrations_name
      ON schema_migrations(migration_name)
  `);
}

async function getExecutedMigrations(client) {
  const result = await client.query('SELECT migration_name, checksum FROM schema_migrations');
  return new Map(result.rows.map((row) => [row.migration_name, row.checksum]));
}

function getMigrationFiles() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql') && !file.toLowerCase().includes('readme'))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || '0', 10);
      if (numA !== numB) return numA - numB;
      return a.localeCompare(b);
    });
  return files;
}

async function runMigrations() {
  if (!DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL is required.');
    console.error('   Example: DATABASE_URL=postgresql://user:pass@localhost:5432/sahamology');
    process.exit(1);
  }

  const client = new Client({ connectionString: DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await client.connect();
  console.log('🚀 PostgreSQL Migration Runner\n');
  console.log(`   Target: ${client.host}:${client.port}/${client.database}\n`);

  try {
    await ensureTrackingTable(client);
    console.log('✅ Migration tracking table ready\n');

    const executed = await getExecutedMigrations(client);
    const files = getMigrationFiles();
    console.log(`📊 Previously executed: ${executed.size} migrations`);
    console.log(`📁 Found: ${files.length} migration files\n`);

    const pending = [];
    for (const filename of files) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
      const checksum = calculateChecksum(content);
      if (!executed.has(filename)) {
        pending.push({ filename, content, checksum });
      } else if (executed.get(filename) !== checksum) {
        console.warn(`⚠️  Warning: ${filename} has been modified since it was applied (checksum mismatch; skipping).\n`);
      }
    }

    if (pending.length === 0) {
      console.log('✨ All migrations up to date!\n');
      return;
    }

    console.log(`🔧 Running ${pending.length} pending migrations:\n`);

    let totalTime = 0;
    let successCount = 0;
    for (const migration of pending) {
      const start = Date.now();
      console.log(`  ⏳ Executing ${migration.filename}...`);
      try {
        await client.query('BEGIN');
        // Multi-statement migration files use the simple query protocol (no parameters).
        await client.query(migration.content);
        const executionTime = Date.now() - start;
        await client.query(
          `INSERT INTO schema_migrations (migration_name, checksum, execution_time_ms)
           VALUES ($1, $2, $3)`,
          [migration.filename, migration.checksum, executionTime]
        );
        await client.query('COMMIT');
        console.log(`  ✅ ${migration.filename} completed (${executionTime}ms)`);
        totalTime += executionTime;
        successCount += 1;
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`\n❌ Migration failed: ${migration.filename}`);
        console.error(`   Error: ${error.message}\n`);
        process.exitCode = 1;
        throw error;
      }
    }

    console.log(`\n✨ Success! Executed ${successCount}/${pending.length} migrations`);
    console.log(`   Total time: ${totalTime}ms\n`);
  } finally {
    await client.end();
  }
}

runMigrations().catch((error) => {
  console.error('\n💥 Unexpected error:', error.message);
  process.exit(1);
});
