# AimLeads SaaS (Front + Back)

Application full-stack React/Vite + API Node/Express pour qualification de leads, scoring ICP, signaux IA et priorisation SDR.

## Stack

- Frontend: React 18 + Vite + Tailwind + TanStack Query
- Backend: Express API (`/api/*`)
- Data provider: `local` (JSON) ou `supabase` (PostgREST)
- Auth provider: `legacy` (session locale) ou `supabase` (Supabase Auth natif)

## Ce qui est en place

- Routes publiques: `/`, `/pricing`, `/login`
- Routes privees: `/dashboard`, `/reports`, `/icp`, `/settings`, `/leads/:leadId`
- API auth: `register`, `login`, `logout`, `me`
- API leads: CRUD + import CSV + signal discovery + external signals
- API ICP: liste + filtre + profil actif
- API analyse: scoring ICP + IA + final
- Dev tools: `load-demo`, `load-mantra`, `reanalyze`, `checkup`

## SaaS-grade backend hardening

- Isolation stricte `user/workspace` pour leads + ICP + analyse
- Validation payloads (`zod`)
- Rate limiting API + auth
- Headers securite + logs JSON + `x-request-id`
- Runtime config stricte (env required)

## Lancer en local

1. Installer dependances:

```bash
npm install
```

2. Creer `.env`:

```bash
cp .env.example .env
```

3. Mode local simple (sans Supabase):

- `DATA_PROVIDER=local`
- `AUTH_PROVIDER=legacy`

4. Mode full Supabase (recommande pour validation SaaS):

- `DATA_PROVIDER=supabase`
- `AUTH_PROVIDER=supabase`
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY=<publishable-key>`
- `SUPABASE_SERVICE_ROLE_KEY=<secret-key>`
- `SUPABASE_FALLBACK_TO_LOCAL=0`

5. Lancer front + back:

```bash
npm run dev:full
```

Si `npm` n'est pas reconnu sous Windows:

```powershell
.\scripts\dev-full.ps1
```

ou

```cmd
scripts\dev-full.cmd
```

- Front: http://localhost:5173
- API: http://localhost:3001
- Health: http://localhost:3001/api/health

## Health check important

`/api/health` expose:

- `provider`: provider configure (`local`/`supabase`)
- `auth_provider`: auth configure (`legacy`/`supabase`)
- `active_provider`: provider reel (`supabase`/`local-fallback`)
- `fallback_reason`: raison du fallback

En mode SaaS local, le bon etat est:

- `provider: "supabase"`
- `auth_provider: "supabase"`
- `active_provider: "supabase"`

## Compte demo

- Email: `demo@aimleads.local`
- Password: `demo1234`

En mode `AUTH_PROVIDER=supabase`, le compte est bootstrappe cote backend.

## Scoring Settings UI

Dans `Settings > Scoring Settings`:

- Ajuste poids ICP/IA
- Ajuste seuils ICP et seuils finaux
- Utilise presets (`Balanced`, `ICP-first`, `Intent-first`)
- Sauvegarde sans toucher au code

## Supabase migration

1. Executer `supabase/schema.sql`
2. Executer migrations de `supabase/migrations/`
3. Optionnel: `supabase/seed.sql`
4. Export local -> Supabase:

```bash
npm run export:supabase
```

Guide detaille: [docs/supabase-migration.md](/C:/Codex/Aimlead.io saas/aimleads-saas/docs/supabase-migration.md)
Guide operateur sans code: [docs/non-technical-operator-guide.md](/C:/Codex/Aimlead.io saas/aimleads-saas/docs/non-technical-operator-guide.md)

## Auth note (captcha)

Si tu vois `Security verification is required` / `captcha`:

- desactive Bot Protection/CAPTCHA dans Supabase Auth pour le local,
- ou implemente un vrai flux captcha cote front.

## Tests

```bash
npm run lint
npm run test:api
npm run build
```

## Deploiement

- API Vercel entry: [api/index.js](/C:/Codex/Aimlead.io saas/aimleads-saas/api/index.js)
- Config Vercel: [vercel.json](/C:/Codex/Aimlead.io saas/aimleads-saas/vercel.json)
- Checklist VPS: [docs/vps-deploy-checklist.md](/C:/Codex/Aimlead.io saas/aimleads-saas/docs/vps-deploy-checklist.md)

