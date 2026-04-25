# Hostinger Docker Deploy Checklist

This is the source-of-truth deployment flow for AimLeads production as of April 15, 2026.

Production path:

- app runtime: `Dockerfile`
- orchestration: `docker-compose.yml`
- reverse proxy / TLS: Traefik
- public domains: `aimlead.io`, `www.aimlead.io`
- app container: `aimleads`
- health endpoint: `GET /api/health`

Legacy Vercel files still exist in the repo for historical reference only. They are not the production path.

## 1. Before you deploy

Run these locally and make sure they all pass:

1. `npm install`
2. `npm run lint`
3. `npm run test:api`
4. `npm run test:ui`
5. `npm run build`

Also verify the frontend build stamp and the API health payload expose the same build metadata locally.

## 2. Server prerequisites

On the Hostinger VPS, make sure these are already installed and working:

- Docker Engine
- Docker Compose plugin
- Traefik container on the same Docker network
- valid `.env` file in the project root
- Supabase Auth redirect URLs allow `https://aimlead.io/auth/callback` and `https://aimlead.io/reset-password`

Check the current runtime:

```bash
docker ps
docker compose config
curl -fsS http://127.0.0.1:3010/api/health
```

## 3. Required production files

The production deployment must use these files together:

- `Dockerfile`
- `docker-compose.yml`
- `.env`

Ignore these old or suspicious files during production operations:

- `docker-compose.yml.bak`
- `docker-compose.ymlm`
- `.github/workflows/deploy.yml`

## 4. Build metadata

AimLeads now exposes build metadata both:

- in the frontend build stamp
- in HTML meta tags (`aimleads-build-version`, `aimleads-build-time`, `aimleads-build-commit`)
- in `GET /api/health`
- in response headers (`X-AimLeads-Version`, `X-AimLeads-Commit`, `X-AimLeads-Built-At`)

The relevant variables are:

- `APP_VERSION`
- `APP_BUILD_TIME`
- `APP_COMMIT_SHA`
- `APP_ORIGIN=https://aimlead.io`
- `CORS_ORIGIN=https://aimlead.io,https://www.aimlead.io`

If they are missing, the app will still build, but you lose the ability to confirm whether `aimlead.io` is serving the correct revision.

## 5. Recommended redeploy flow

From the project root on the VPS:

```bash
chmod +x scripts/redeploy-hostinger.sh
./scripts/redeploy-hostinger.sh --no-cache
```

This script:

1. generates build metadata if not already provided
2. rebuilds the `aimleads` image
3. force-recreates the `aimleads` container
4. prints the local API health payload so you can confirm the served build
5. attempts a public `https://aimlead.io/api/health` check with cache busting
6. runs `scripts/verify-live-deploy.mjs` to compare public HTML + health metadata with the expected build

If you want to pin a specific version:

```bash
APP_VERSION=2026.04.15-1 APP_COMMIT_SHA=$(git rev-parse --short HEAD) ./scripts/redeploy-hostinger.sh --no-cache
```

## 6. Manual fallback deploy

If you need to run the commands manually:

```bash
export APP_VERSION="${APP_VERSION:-$(date -u +'%Y.%m.%d-%H%M')}"
export APP_BUILD_TIME="${APP_BUILD_TIME:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}"
export APP_COMMIT_SHA="${APP_COMMIT_SHA:-$(git rev-parse --short HEAD)}"

docker compose build --pull --no-cache app
docker compose up -d --force-recreate --remove-orphans app
curl -fsS "http://127.0.0.1:3010/api/health?ts=$(date +%s)"
curl -fsS "https://aimlead.io/api/health?ts=$(date +%s)"
```

## 7. Post-deploy validation

After the redeploy:

1. `docker ps` shows the `aimleads` container as healthy
2. `curl -fsS "http://127.0.0.1:3010/api/health?ts=$(date +%s)"` returns the expected build metadata
3. `curl -I https://aimlead.io` exposes the same `X-AimLeads-*` headers
4. `npm run verify:live-deploy` passes on the VPS after the deploy
5. opening `https://aimlead.io` shows the same build stamp as the API
6. landing page loads on desktop and mobile
7. login works
8. one authenticated page loads without 401 loop

## 8. If `aimlead.io` still serves an old version

Check these in order:

1. the image was actually rebuilt, not reused from cache
2. the `aimleads` container was restarted after the build
3. Traefik is routing to the current `aimleads` container
4. no old `dist` content is mounted from a stale volume
5. browser cache / CDN cache is not holding an older asset manifest
6. the domain is not pointing to a different deployment path

Useful commands:

```bash
docker compose images
docker compose ps
docker logs aimleads --tail=200
curl -fsS http://127.0.0.1:3010/api/health
```

## 9. Smoke test checklist

Run these after every production cutover:

1. landing desktop
2. landing mobile
3. login
4. OAuth callback
5. dashboard
6. onboarding
7. import leads
8. first lead analysis
9. account settings build stamp
