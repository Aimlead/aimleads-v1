# AimLeads SaaS

Application full-stack React/Vite + API Node/Express pour qualification de leads, scoring ICP, signaux IA et priorisation SDR.

## Stack

- Frontend: React 18 + Vite + Tailwind + TanStack Query
- Backend: Express API (`/api/*`)
- Data provider: `local` (JSON, dev uniquement) ou `supabase` (PostgREST)
- Auth provider: `legacy` (dev uniquement) ou `supabase` (Supabase Auth natif)

## Ce qui est en place

- Routes publiques: `/`, `/pricing`, `/login`
- Routes privees coeur: `/dashboard`, `/pipeline`, `/analytics`, `/icp`, `/team`, `/settings`, `/leads/:leadId`, `/onboarding`
- API auth: `register`, `login`, `logout`, `me`, `sso`
- API leads: CRUD + import CSV + signal discovery + external signals
- API ICP: liste + filtre + profil actif
- API analyse: scoring ICP + IA + final
- Workspace: invites, credits, export RGPD, sample data
- Dev tools: `load-demo`, `load-mantra`, `reanalyze`, `checkup`

## SaaS-grade backend hardening

- Isolation stricte `user/workspace` pour leads + ICP + analyse
- Validation payloads (`zod`)
- Rate limiting API + auth
- Headers securite + logs JSON + `x-request-id`
- Runtime config stricte (env required)
- Export workspace RGPD
- Email transactionnel de base
- Build metadata expose dans l'app et via `/api/health`
- Headers HTTP `X-AimLeads-*` exposes pour verifier rapidement la version servie

## Lancer en local

1. Installer les dependances:

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

- Front: [http://localhost:5173](http://localhost:5173)
- API: [http://localhost:3001](http://localhost:3001)
- Health: [http://localhost:3001/api/health](http://localhost:3001/api/health)

## Health check important

`/api/health` expose:

- `provider`: provider configure (`local`/`supabase`)
- `auth_provider`: auth configure (`legacy`/`supabase`)
- `active_provider`: provider reel (`supabase`/`local-fallback`)
- `fallback_reason`: raison du fallback
- `build.version`
- `build.builtAt`
- `build.commitSha`

En mode SaaS local, le bon etat est:

- `provider: "supabase"`
- `auth_provider: "supabase"`
- `active_provider: "supabase"`

## Compte demo

- Email: `demo@aimleads.local`
- Password: `demo1234`

En mode `AUTH_PROVIDER=supabase`, le compte est bootstrappe cote backend.

## Scoring settings

Dans `Settings > Scoring Settings`:

- ajuster poids ICP/IA
- ajuster seuils ICP et seuils finaux
- utiliser les presets (`Balanced`, `ICP-first`, `Intent-first`)
- sauvegarder sans toucher au code

## Supabase migration

1. Executer `supabase/schema.sql`
2. Executer les migrations de `supabase/migrations/`
3. Optionnel: `supabase/seed.sql`
4. Export local -> Supabase:

```bash
npm run export:supabase
```

Guides:

- [Migration Supabase](docs/supabase-migration.md)
- [Guide operateur non technique](docs/non-technical-operator-guide.md)

## Auth note (captcha)

Si tu vois `Security verification is required` ou `captcha`:

- desactive Bot Protection/CAPTCHA dans Supabase Auth pour le local
- ou implemente un vrai flux captcha cote front

## Tests

```bash
npm run lint
npm run test:api
npm run test:ui
npm run build
```

## Validation batch leads reels

Batch proxy 12-15 leads avec l'ICP actif:

```bash
npm run validate:real-leads
```

Options utiles:

```bash
node scripts/run-real-lead-batch-validation.mjs --input tmp_real_leads.json --limit 15
node scripts/run-real-lead-batch-validation.mjs --icp-name "Mon ICP Actif" --limit 12
```

## Deploiement

La production actuelle passe par Hostinger + Docker + Traefik.

Source of truth:

- [Dockerfile](Dockerfile)
- [docker-compose.yml](docker-compose.yml)
- [Checklist de deploiement VPS](docs/vps-deploy-checklist.md)
- [Script de redeploy Hostinger](scripts/redeploy-hostinger.sh)
- [Verification live/public du build](scripts/verify-live-deploy.mjs)

Verifier rapidement la prod publique:

```bash
npm run verify:live-deploy
```

Ce check doit echouer tant que `aimlead.io` sert encore un ancien build, ou si les headers/meta de build ne sont pas exposes.

Legacy uniquement, non utilise pour la prod courante:

- [vercel.json](vercel.json)
- [.github/workflows/deploy.yml](.github/workflows/deploy.yml)
