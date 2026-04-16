import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SAFE_MIGRATION_FILES,
  GATED_MIGRATION_FILES,
  buildDbConfig,
  resolveMigrationPlan,
  resolveRunnerOptions,
} from '../scripts/run-migrations.mjs';

test('buildDbConfig requires SUPABASE_DB_PASSWORD', () => {
  assert.throws(() => buildDbConfig({}), /SUPABASE_DB_PASSWORD is required/i);
});

test('resolveMigrationPlan defaults to safe phases only', () => {
  const plan = resolveMigrationPlan([
    '20260317_add_lead_signal_columns.sql',
    ...SAFE_MIGRATION_FILES,
    ...GATED_MIGRATION_FILES,
  ], { migrationMode: 'safe', allowDestructive: false });

  assert.deepEqual(plan, SAFE_MIGRATION_FILES);
  assert.ok(!plan.includes('20260317_add_lead_signal_columns.sql'));
});

test('resolveMigrationPlan rejects gated phases without explicit destructive approval', () => {
  assert.throws(
    () => resolveMigrationPlan([...SAFE_MIGRATION_FILES, ...GATED_MIGRATION_FILES], {
      migrationMode: 'full',
      allowDestructive: false,
    }),
    /ALLOW_DESTRUCTIVE_MIGRATIONS=true/i
  );
});

test('resolveRunnerOptions uses safe mode by default', () => {
  const options = resolveRunnerOptions({});
  assert.equal(options.migrationMode, 'safe');
  assert.equal(options.allowDestructive, false);
});
