# Supabase Migration Runbook

AimLeads uses **versioned Supabase SQL migrations** as the single source of truth for database evolution.

This repo already contains the migration history under:

- `/supabase/migrations`

Do **not** introduce Prisma or a parallel migration system. The target workflow is:

1. keep schema changes in timestamped SQL files
2. apply them in order with the Supabase CLI or Supabase SQL editor
3. verify runtime assumptions after each rollout

## Current migration inventory

The repo currently includes versioned migrations for:

- lead signal columns
- audit log
- native Supabase auth
- phase 0 to phase 5 schema reconciliation
- credits and RLS fixes
- CRM integration
- `pgcrypto` CRM preparation
- `ai_runs`
- `feature_flags`

Before pushing to production, compare the files in `/supabase/migrations` with the migrations already applied on the target Supabase project.

## Source of truth

- Schema bootstrap: `/supabase/schema.sql`
- Incremental changes: `/supabase/migrations/*.sql`
- Optional seed data: `/supabase/seed.sql`

## Recommended application order

For a fresh Supabase project:

1. apply `/supabase/schema.sql`
2. apply every file in `/supabase/migrations` in lexical order
3. apply `/supabase/seed.sql` only if you really want demo/bootstrap data

For an existing project:

1. inspect which migrations are already applied
2. back up the database first
3. apply only the missing migration files in lexical order
4. verify the runtime after each batch

## Variables required for runtime validation

Set these environment variables before running the app in full Supabase mode:

- `DATA_PROVIDER=supabase`
- `AUTH_PROVIDER=supabase`
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<publishable-key>`
- `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>`
- `SUPABASE_FALLBACK_TO_LOCAL=0`
- `SESSION_SECRET=<strong-random-secret>`
- `CORS_ORIGIN=<allowed-origins>`

Optional but strongly recommended:

- `CRM_ENCRYPTION_KEY=<strong-secret>`

## Supabase CLI workflow

Recommended local commands:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

If you need to generate a new migration:

```bash
supabase migration new <short_description>
```

Then edit the created SQL file in `/supabase/migrations`.

## Critical checks after migration

After applying migrations, validate these product-critical areas:

1. **CRM token encryption**
   - confirm the `pgcrypto` preparation migration is applied
   - confirm CRM tokens are never returned in clear text by the API
   - confirm the runtime has a valid `CRM_ENCRYPTION_KEY`

2. **Feature flags**
   - confirm the `feature_flags` table exists
   - confirm `/api/workspace/feature-flags` loads correctly

3. **AI runs**
   - confirm the `ai_runs` table exists
   - confirm analyze/discover/sequence flows write runs successfully

4. **Auth**
   - confirm Supabase auth tables and the native auth migration are aligned
   - confirm email/password login works
   - confirm OAuth callback writes a valid app session

5. **Workspace billing / credits**
   - confirm `workspace/credits` still resolves usage, entitlements, and runway

## Post-migration verification

Run:

```bash
npm run lint
npm run test:api
npm run test:ui
npm run build
```

Then validate the runtime:

1. `GET /api/health`
2. login with email/password
3. optional SSO callback
4. CRM page loads
5. feature flags load
6. analyze a lead
7. verify `ai_runs` records exist

## Safety checklist for production

Before applying migrations in production:

1. back up the production database
2. export current environment variables
3. confirm the exact migration list to apply
4. apply changes during a low-risk window
5. verify `/api/health` and one real login immediately after rollout

## Notes

- Service role keys bypass RLS, so backend workspace scoping still matters.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend env files.
- If login fails with a CAPTCHA/security verification message, check Supabase Bot Protection settings or pass a real captcha token through the auth flow.
