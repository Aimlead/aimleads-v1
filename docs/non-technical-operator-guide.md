# AimLeads - Guide Operateur (Sans Code)

Ce guide te permet de gerer l'app au quotidien sans devoir coder.

## 1) Ce que tu peux piloter dans l'UI AimLeads

- `Settings > Scoring Settings`
  - Ajuster le poids `ICP` vs `AI`.
  - Ajuster les seuils (`Excellent`, `Strong`, `Medium`).
  - Sauvegarder avec `Save scoring settings`.
- `Settings > Dev Tools`
  - `Load Mantra (174)`: recharge la liste de test.
  - `Re-analyze Workspace`: relance l'analyse de tous les leads visibles.
  - `Run Checkup`: diagnostic rapide (provider, schema, stats).
- `Dashboard`
  - Changer de liste de leads.
  - Changer le profil ICP actif.
  - Filtrer par statut/follow-up.

## 2) Ce que tu peux piloter directement dans Supabase

- `Authentication > Users`
  - Voir les comptes inscrits.
  - Bloquer/supprimer un compte.
- `Table Editor > users/workspaces/workspace_members`
  - Verifier les workspaces et l'affectation des users.
- `Table Editor > leads`
  - Corriger des valeurs metier (industry, country, contact role, etc.).
- `SQL Editor`
  - Executer les migrations si le checkup detecte un schema incomplet.

## 3) Regle d'or pour rester coherent

- Tu peux modifier les **donnees** (rows).
- Evite de modifier la **structure** des tables a la main (colonnes, types) sans migration.
- Si `Run Checkup` affiche un warning schema:
  - copie le SQL propose dans l'UI Settings,
  - colle dans `Supabase > SQL Editor`,
  - execute,
  - relance `Run Checkup`.

## 4) "Action Git" et "Validation", c'est quoi ?

Dans Codex desktop:

- `Validation` = un `git commit` (sauvegarde versionnee de tes changements).
- `Valider et effectuer un push` = commit + envoi sur GitHub.
- `Valider et creer une PR` = commit + branche + Pull Request.

Si tu as l'erreur `Author identity unknown`, configure Git une fois:

```bash
git config --global user.name "Ton Nom"
git config --global user.email "ton-email@exemple.com"
```

Ensuite la validation (commit) fonctionne.

## 5) Publier sur GitHub (simple)

1. Cree un repo vide sur GitHub (sans README/.gitignore auto si possible).
2. Dans le dossier projet:

```bash
git init
git add .
git commit -m "Initial SaaS baseline"
git branch -M main
git remote add origin https://github.com/<ton-user>/<ton-repo>.git
git push -u origin main
```

## 6) Verification rapide avant deploy Vercel

Lancer:

```bash
npm run lint
npm run test:api
npm run build
```

Puis en local:

- `npm run dev:full`
- ouvrir `http://localhost:5173`
- verifier `Settings > Dev Tools > Run Checkup` sans warning critique.
