# Supabase Migration Guide

This project supports two modes:

- Local mode: `DATA_PROVIDER=local`, `AUTH_PROVIDER=legacy`
- Full Supabase mode: `DATA_PROVIDER=supabase`, `AUTH_PROVIDER=supabase`

For SaaS-grade local validation, use full Supabase mode.

## 1) Create schema and policies

In Supabase SQL Editor:

1. Run [supabase/schema.sql](/C:/Codex/Aimlead.io saas/aimleads-saas/supabase/schema.sql)
2. Run each file from [supabase/migrations](/C:/Codex/Aimlead.io saas/aimleads-saas/supabase/migrations)
3. Optional: run [supabase/seed.sql](/C:/Codex/Aimlead.io saas/aimleads-saas/supabase/seed.sql)

If SQL editor warns about destructive operations, validate and continue only if this is a fresh project or expected reset.

## 2) Export local data (optional)

```bash
npm run export:supabase
```

This writes JSON files under `supabase/export/`.

Suggested import order:

1. `workspaces`
2. `users`
3. `workspace_members`
4. `icp_profiles`
5. `leads`

## 3) Configure environment

Set in `.env`:

- `DATA_PROVIDER=supabase`
- `AUTH_PROVIDER=supabase`
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<publishable-key>`
- `SUPABASE_SERVICE_ROLE_KEY=<secret-key>`
- `SUPABASE_FALLBACK_TO_LOCAL=0`
- `SESSION_SECRET=<strong-random-secret>`
- `CORS_ORIGIN=<allowed-origins>`

## 4) Run and validate

```bash
npm run dev:full
```

Check:

1. `GET /api/health` returns:
   - `provider: "supabase"`
   - `auth_provider: "supabase"`
   - `active_provider: "supabase"`
2. Register/login works.
3. `Settings > Dev Tools > Load Mantra (174)` imports and analyzes data.
4. `Run Checkup` returns no critical warning.

## 5) Auth CAPTCHA note

If registration/login returns `Security verification is required`:

- Supabase Bot Protection/CAPTCHA is enabled.
- For local dev, disable it in Supabase Auth settings.
- Or wire a captcha token in frontend and pass it to auth flow.

## Notes

- Service role key bypasses RLS, so backend enforces workspace scoping.
- RLS policies are still useful for direct SQL/client safety and future direct access patterns.
- Never expose service role key in frontend env.
