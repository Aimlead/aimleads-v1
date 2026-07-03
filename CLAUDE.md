# CLAUDE.md — AimLeads SaaS

Dernière mise à jour : 2026-07-02 (branche `claude/aimlead-sales-readiness-9u55z6`).

## Ce qu'est le produit

AimLeads est un SaaS B2B français-first de qualification de leads pour SDR :
scoring ICP déterministe + enrichissement IA (Claude/Anthropic uniquement),
signaux internet, priorisation, séquences d'outreach, intégrations CRM
(HubSpot, Salesforce), gestion d'équipe/workspace, crédits et plans.

**Claude (Anthropic) est le seul fournisseur IA.** Hunter.io et NewsAPI ont
été retirés — ne pas les réintroduire. La découverte de signaux repose sur le
scan du site web du lead + la recherche web de Claude (`web_search`).

## Stack et commandes

- Frontend : React 18 + Vite + Tailwind + TanStack Query + i18next (fr/en, fallback fr)
- Backend : Express (`server/`), data provider `local` (JSON, dev) ou `supabase`
- `npm run dev:full` — front (5173) + API (3001) ; en dev les requêtes CSRF exigent
  cookie `aimleads_csrf` + header `x-csrf-token` (double-submit) + Origin
- `npm run lint` / `npm run test:api` (node --test, ~110 tests) /
  `npm run test:ui` (vitest, ~75 tests) / `npm run build`
- Avant tout push : les quatre doivent être verts

## Conventions importantes

- **i18n** : toute chaîne visible passe par `t()`. Les deux locales
  (`src/locales/{fr,en}/translation.json`) doivent rester à parité (script de
  vérif simple : flatten des clés et diff). Les valeurs d'enum stockées en
  anglais (`To Contact`, `Qualified`, `Contact within 48h`, codes d'action)
  sont traduites **à l'affichage** via les helpers de
  `src/lib/leadPresentation.js` (`getFollowUpStatusLabel`,
  `getLeadStatusLabel`, `getRecommendedActionLabel`, `getNextActionLabel`).
  `deriveLeadNextAction` retourne des codes (`call_now`, `enrich_contact`…),
  jamais du texte.
- **Prompts IA** : les sorties destinées aux utilisateurs (icebreakers,
  signaux, insights) sont demandées en français dans les prompts système
  (`llmService.js`, `claudeSignalAnalysisService.js`,
  `claudeWebResearchService.js`). Les codes d'enum restent en anglais.
- **Crédits** : `requireCredits(action)` débite avant le handler. Tout chemin
  d'échec d'une action IA doit rembourser via `refundCredits(req, reason)`
  (`server/lib/credits.js`) et renvoyer `code: 'AI_NOT_CONFIGURED'` (503) si
  la clé LLM manque. Verrouillé par `tests/ai-failure-refund.test.mjs`.
- **`POST /workspace/credits/grant` est un outil de dev** : 403
  `SALES_ASSISTED_ONLY` en production (chaque inscrit self-serve est owner de
  son workspace — l'exposer permettrait des crédits gratuits illimités).
- Les cartes dev de `Settings.jsx` (Runtime & Backend, Mode workspace,
  Données mock, bouton +150 crédits) sont gatées par `import.meta.env.DEV`.
- **Une seule landing** : `LandingV2` (`/`). La legacy a été supprimée ; seul
  `src/components/landing/BookingModal.jsx` subsiste (utilisé par la V2) et
  ses styles vivent dans `src/styles/landing.css` (importé par `main.jsx`).
- Ne jamais committer de fichiers `.bak`.

## État opérationnel (vérifié en navigateur + API)

- Parcours complet fonctionnel en mode local : inscription → onboarding
  (ICP rapide + pipeline de démo) → dashboard/priorités/pipeline/analytics/
  facturation/équipe — zéro erreur console.
- Scoring ICP déterministe fonctionne sans clé IA (ex. 77/100 « Strong Fit »).
- Sans `ANTHROPIC_API_KEY` : les actions IA renvoient 503 `AI_NOT_CONFIGURED`
  proprement, crédits remboursés ; le CRM et la découverte dégradent sans 500.
- Sécurité en place : CSP + headers complets (`observability.js`), SSRF
  (`lib/ssrf.js` utilisé par la découverte), rate limiting par user/IP,
  fail-closed sur la résolution de membership, audit log des actions sensibles.
- Entitlements par plan appliqués : places équipe (invites bloquées à la
  limite), slots CRM, `requirePlan` sur séquences/recherche.

## Ce qui reste à valider / faire

1. **Validation live du scoring avec une vraie `ANTHROPIC_API_KEY`**
   (qualité des signaux, icebreakers en français, latences, coûts).
   C'est LE prochain jalon — non testable sans clé.
2. Billing réel (Stripe ou processus sales-assisted outillé) — aujourd'hui le
   plan/les crédits sont persistés mais l'upgrade est manuel.
3. Réécriture tenancy (`workspace_members` comme unique vérité) — amélioration
   structurelle, pas un bloqueur.
4. Emails transactionnels : no-op sans clé (`email_skipped_no_key`) ; l'invite
   propose un lien à copier en fallback. Brancher un fournisseur SMTP/API.

## Déploiement (Hostinger VPS, Docker)

- Stack autonome dans `docker-compose.yml` : `app` (Express + frontend buildé,
  port 3010) + `caddy` (HTTPS automatique Let's Encrypt pour `aimlead.io`,
  redirection www → apex). Plus de Traefik/nginx externe.
- `pull_policy: build` est indispensable : le panneau Docker Hostinger fait un
  `compose pull` avant de déployer et l'image n'existe pas sur Docker Hub.
- Guide complet (recovery inclus) : `docs/vps-deploy-checklist.md`.
  Redéploiement : `./scripts/redeploy-hostinger.sh` sur le VPS, ou le workflow
  manuel `.github/workflows/deploy-hostinger.yml` (secrets `VPS_HOST`,
  `VPS_USER`, `VPS_SSH_KEY`).
- En production le serveur refuse de démarrer sans `SESSION_SECRET`, les clés
  Supabase, `ANTHROPIC_API_KEY` et `RESEND_API_KEY` (voir `.env.example`).
- CI : le job api-tests exporte `SUPABASE_FALLBACK_TO_LOCAL=1` — tout test qui
  simule la production doit épingler cette variable à `false` dans son env.
