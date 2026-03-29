/**
 * run-migrations.mjs
 * Repo-first migration runner for AimLead's phased Supabase migration plan.
 *
 * Defaults to SAFE mode:
 * - fresh DB: apply schema.sql
 * - existing DB: apply only phase0 + phase1
 *
 * Destructive / schema-converging phases must be explicitly enabled.
 */
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

export const SAFE_MIGRATION_FILES = [
  '20260327_phase0_reconcile_existing.sql',
  '20260327_phase1_additions.sql',
];

export const GATED_MIGRATION_FILES = [
  '20260327_phase2_rls_unification.sql',
  '20260327_phase3_leads_cleanup.sql',
  '20260327_phase4_users_cleanup.sql',
  '20260327_phase5_icp_cleanup.sql',
];

const KNOWN_MIGRATION_FILES = [...SAFE_MIGRATION_FILES, ...GATED_MIGRATION_FILES];

export const buildDbConfig = (env = process.env) => {
  const password = String(env.SUPABASE_DB_PASSWORD || '').trim();
  if (!password) {
    throw new Error('SUPABASE_DB_PASSWORD is required to run migrations.');
  }

  return {
    host: String(env.SUPABASE_DB_HOST || 'db.yamexmuasgaydfyxtgkm.supabase.co').trim(),
    port: Number(env.SUPABASE_DB_PORT || 5432),
    database: String(env.SUPABASE_DB_NAME || 'postgres').trim(),
    user: String(env.SUPABASE_DB_USER || 'postgres').trim(),
    password,
    ssl: { rejectUnauthorized: false },
  };
};

export const resolveRunnerOptions = (env = process.env) => {
  const migrationMode = String(env.MIGRATION_MODE || 'safe').trim().toLowerCase();
  const allowDestructive = ['1', 'true', 'yes', 'on'].includes(String(env.ALLOW_DESTRUCTIVE_MIGRATIONS || '').trim().toLowerCase());

  return {
    migrationMode,
    allowDestructive,
  };
};

export const resolveMigrationPlan = (filenames, { migrationMode = 'safe', allowDestructive = false } = {}) => {
  const known = filenames.filter((name) => KNOWN_MIGRATION_FILES.includes(name));

  if (migrationMode === 'safe') {
    return known.filter((name) => SAFE_MIGRATION_FILES.includes(name));
  }

  if (!allowDestructive) {
    throw new Error('Destructive phases require ALLOW_DESTRUCTIVE_MIGRATIONS=true.');
  }

  return known;
};

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      filename   text        primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function getApplied(client) {
  const res = await client.query('select filename from schema_migrations');
  return new Set(res.rows.map((row) => row.filename));
}

async function markApplied(client, filename) {
  await client.query(
    'insert into schema_migrations (filename) values ($1) on conflict do nothing',
    [filename]
  );
}

async function tableExists(client, name) {
  const res = await client.query(
    `select 1 from information_schema.tables where table_schema='public' and table_name=$1`,
    [name]
  );
  return res.rowCount > 0;
}

async function runFile(client, filePath, applied) {
  const label = path.relative(root, filePath);
  const filename = path.basename(filePath);

  if (applied.has(filename)) {
    console.log(`  ↩ ${label} (already applied, skipping)`);
    return;
  }

  const sql = await fs.readFile(filePath, 'utf8');
  console.log(`\n▶ ${label}`);
  await client.query(sql);
  await markApplied(client, filename);
  console.log('  ✓ done');
}

export async function runMigrations({ env = process.env } = {}) {
  const dbConfig = buildDbConfig(env);
  const options = resolveRunnerOptions(env);
  const client = new Client(dbConfig);

  await client.connect();
  console.log('Connected to PostgreSQL', (await client.query('select version()')).rows[0].version.split(' ').slice(0, 2).join(' '));

  try {
    await ensureMigrationsTable(client);
    const applied = await getApplied(client);
    const hasWorkspaces = await tableExists(client, 'workspaces');

    if (!hasWorkspaces) {
      console.log('\nFresh DB detected — running schema.sql');
      await runFile(client, path.join(root, 'supabase/schema.sql'), applied);
      console.log('\n✅ Schema bootstrapped.');
      return;
    }

    console.log(`\nExisting DB detected — running ${options.migrationMode} migration plan`);
    const migrationsDir = path.join(root, 'supabase/migrations');
    const files = (await fs.readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const plan = resolveMigrationPlan(files, options);

    for (const file of plan) {
      await runFile(client, path.join(migrationsDir, file), applied);
    }

    console.log('\n✅ Planned migrations complete.');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runMigrations().catch((error) => {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  });
}
