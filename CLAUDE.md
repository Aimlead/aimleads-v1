# CLAUDE.md — AimLeads SaaS

Dernière mise à jour : 2026-07-01. Ce fichier décrit l'état réel du repo ; l'ancien handoff (qui parlait de changements non commités et d'un chemin Windows) est obsolète — tout ce travail a été mergé sur `main` via les PRs #74 et #75.

## Vue d'ensemble

AimLeads est un SaaS de scoring et priorisation de leads B2B :
- Import de leads (CSV/xlsx), scoring ICP par règles, scoring IA (Claude/Anthropic) et signaux d'intention internet.
- Espace multi-tenant (workspaces, invitations, rôles, transfert de propriété, audit log).
- Funnel public (landing, pricing, demandes de démo, analytics d'événements).
- Plans/crédits/entitlements soft (upgrade modal, enforcement de plan).

## Stack

- Frontend : React 18 + Vite, React Router 6, TanStack Query, Tailwind + Radix (shadcn), i18next (fr/en).
- Backend : Express (`server/`), Zod pour la validation, stockage `local` (JSON) ou `supabase` (prod exige Supabase pour data + auth).
- IA : `@anthropic-ai/sdk` (fallback heuristique si pas de clé), Hunter et NewsAPI pour l'enrichissement.
- Déploiement : Docker (`Dockerfile`, `docker-compose.yml` avec labels Traefik pour aimlead.io), entrée serverless dans `api/index.js`.

## Commandes

```bash
npm run dev:full     # front (vite) + API en watch
npm run lint         # eslint --quiet (doit être vide)
npm run test:api     # node --test tests/*.test.mjs
npm run test:ui      # vitest (src/tests)
npm run build        # vite build (logLevel error => silencieux si OK)
npm run start:api    # serveur API seul (sert dist/ en production)
```

L'API démarre en dev sans variable d'env obligatoire (provider `local`, base JSON). En production, `server/lib/config.js` échoue explicitement si `SESSION_SECRET`, `CORS_ORIGIN`, `DATA_PROVIDER=supabase`, `AUTH_PROVIDER=supabase` ne sont pas fournis.

## Structure

- `server/routes/` : auth, leads, analyze, icp, workspace, public, jobs, crm, dev, metrics, audit…
- `server/lib/` : config, validation (Zod), dataStore, credits/plans, rateLimit, ssrf, queue, auditLog, supabaseAuth…
- `server/services/` : analyzeService (pipeline de scoring), llmService, aiRunService, découverte de signaux.
- `src/pages/` : toutes les pages (Landing V2 par défaut, `/v1` = legacy).
- `src/App.jsx` : routing + gardes `PrivateGuard` / `PublicOnlyGuard` (exportées pour les tests).
- `tests/` : tests API (node:test) ; `src/tests/` : tests UI (vitest + testing-library).
- `supabase/` : schema.sql, migrations, seed.
- `docs/` : PRD, architecture, protocole de test leads réels, checklist déploiement VPS.

## Points d'attention (appris sur le terrain)

- CSRF : toute mutation exige soit `X-Requested-With: XMLHttpRequest`, soit cookie `csrf` + header `X-CSRF-Token` + Origin de confiance. Pour tester à la main via curl, récupérer d'abord le cookie CSRF via un GET.
- L'inscription est `POST /api/auth/register` (pas `/signup`).
- Les réponses API sont enveloppées dans `{ data: ... }`.
- `POST /api/analyze` attend `{ lead: {...} }` complet (pas seulement `lead_id`) et exige un profil ICP actif ; `POST /api/icp` exige `name` + `weights`.
- `company_size` est numérique ; les chaînes de plage (« 51-200 », « 200+ », « 1 000 employés ») sont acceptées côté serveur et ramenées à leur borne basse (aligné sur l'import CSV).
- Mot de passe : min 8 caractères, une majuscule, un chiffre.
- Rate limit analyze : 20/h par utilisateur.

## État de validation (2026-07-01)

- lint OK ; 106 tests API ; 77 tests UI ; build OK.
- Parcours vérifié en local de bout en bout : register → création lead → création ICP → analyze → score final cohérent (fallback heuristique sans clé Anthropic, `ai_score` bas sans signaux vérifiés).
- `/api/health` expose l'état des providers (`claude`, `hunter`, `newsApi`).

## Ce qui reste théorique (non prouvé en prod)

1. Qualité du scoring avec vraie clé Anthropic + vrais sites de leads (utiliser `npm run validate:real-leads` et `scripts/verify-live-deploy.mjs`).
2. Comportement des providers externes (Hunter, NewsAPI) sous charge : retries, timeouts, coûts.
3. Facturation réelle : les plans/crédits sont soft, pas de Stripe.

## Priorités recommandées pour la suite

1. Passe de vérité produit avec vraies clés (scoring, signaux internet, persistance).
2. Facturation réelle (Stripe ou funnel assisté) sur la base des plans/crédits existants.
3. Unification tenancy : faire de `workspace_members` la seule source de vérité d'appartenance (il reste des correspondances par email/`users.workspace_id` par endroits).
4. Jobs asynchrones : la queue existe (`server/lib/queue.js`, flag `async_jobs`) mais l'analyse reste majoritairement synchrone.

## Conventions

- Ne pas committer de fichiers `.bak` (ignorés via `.gitignore`).
- Garder lint/tests/build verts avant tout push.
- i18n : toute chaîne UI passe par i18next (fr = langue par défaut).
