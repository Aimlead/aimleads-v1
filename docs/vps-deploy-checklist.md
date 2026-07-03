# Hostinger Docker Deploy — From Scratch

This is the source-of-truth deployment flow for AimLeads production. It covers a **full clean redeploy** on a Hostinger VPS, including recovering from a broken ("something went wrong") state.

Production stack (fully self-contained, defined in `docker-compose.yml`):

- `app` — Express serving API + built frontend on port 3010 (built from `Dockerfile`)
- `caddy` — reverse proxy with **automatic HTTPS** (Let's Encrypt), owns ports 80/443
- public domains: `aimlead.io`, `www.aimlead.io` (www redirects to apex)
- health endpoint: `GET /api/health`

There is **no external Traefik or nginx dependency anymore** — everything the deployment needs is in this repo: `Dockerfile`, `docker-compose.yml`, `Caddyfile`, plus a `.env` you create on the server.

## 0. Recovering from a broken deployment (start here if the panel says "something went wrong")

The most common failure: the Hostinger Docker panel runs `docker compose pull` before deploying, and the old compose file declared `image: aimleads:latest`, which does not exist on Docker Hub. The pull fails/retries for ~15 minutes and the panel reports an error. This is fixed in the current `docker-compose.yml` (`pull_policy: build`), but you must remove the old broken project first.

SSH into the VPS and wipe the old stack:

```bash
# See what's running
docker ps -a

# Stop and remove the old project (adjust path if different)
cd /docker/aimlead 2>/dev/null && docker compose down --remove-orphans || true

# Remove any leftover containers from previous attempts
docker rm -f aimleads aimleads-caddy 2>/dev/null || true

# If an old Traefik/nginx container is holding ports 80/443, remove it too —
# the new stack's caddy service needs those ports
docker ps --format '{{.Names}}\t{{.Ports}}' | grep -E '80|443'
# docker rm -f <name-of-old-proxy>

# Optional: reclaim disk from old images/build cache
docker image prune -af
docker builder prune -af
```

Also delete the old project in the Hostinger Docker panel UI if it still shows there.

## 1. Server prerequisites

- Docker Engine + Docker Compose plugin (`docker compose version`)
- DNS: `aimlead.io` and `www.aimlead.io` A records pointing at the VPS IP (required for automatic HTTPS)
- Firewall / Hostinger panel: ports **80** and **443** (TCP; 443 UDP too for HTTP/3) open
- Supabase Auth redirect URLs allow `https://aimlead.io/auth/callback` and `https://aimlead.io/reset-password`

## 2. Get the code onto the VPS

```bash
mkdir -p /docker && cd /docker
git clone https://github.com/Aimlead/aimleads-v1.git aimlead
cd aimlead
```

(Or `git fetch && git reset --hard origin/main` inside an existing clone.)

## 3. Create the production .env

```bash
cp .env.example .env
nano .env
```

Required values (the server refuses to boot in production without most of these):

- `SESSION_SECRET` — generate: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` (or `openssl rand -hex 48`)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` — required for lead analysis + outreach generation
- Optional: `HUNTER_API_KEY`, `NEWS_API_KEY`, `SENTRY_DSN`

`NODE_ENV`, `CORS_ORIGIN`, `APP_ORIGIN`, `DATA_PROVIDER`, `AUTH_PROVIDER`, etc. are already pinned in `docker-compose.yml` — you don't need them in `.env`.

Never commit `.env`.

## 4. Deploy

```bash
chmod +x scripts/redeploy-hostinger.sh
./scripts/redeploy-hostinger.sh --no-cache
```

This script:

1. checks `.env` exists
2. generates build metadata (`APP_VERSION`, `APP_BUILD_TIME`, `APP_COMMIT_SHA`)
3. builds the app image locally (never pulls it)
4. starts/recreates the full stack (`app` + `caddy`)
5. waits for and prints the local API health payload
6. checks `https://aimlead.io/api/health` and verifies public build markers

Manual equivalent:

```bash
export APP_VERSION="$(date -u +'%Y.%m.%d-%H%M')"
export APP_BUILD_TIME="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
export APP_COMMIT_SHA="$(git rev-parse --short HEAD)"

docker compose build --pull --no-cache app
docker compose up -d --force-recreate --remove-orphans
curl -fsS "http://127.0.0.1:3010/api/health?ts=$(date +%s)"
curl -fsS "https://aimlead.io/api/health?ts=$(date +%s)"
```

First HTTPS request can take ~30s while Caddy obtains certificates. Certificates persist in the `caddy_data` volume across redeploys.

### Deploying via the Hostinger Docker panel instead of SSH

The compose file works in the panel too (`pull_policy: build` makes the panel build instead of pulling). Point the panel at the repo's `docker-compose.yml` and make sure the `.env` file exists in the project directory on the VPS. SSH + script is still the recommended path because it also verifies the deploy.

## 5. Post-deploy validation

1. `docker compose ps` — `aimleads` is `healthy`, `aimleads-caddy` is `running`
2. `curl -fsS "http://127.0.0.1:3010/api/health?ts=$(date +%s)"` returns `"status":"ok"` with the expected build metadata (`"status":"degraded"` means Supabase is unreachable — check Supabase keys in `.env`)
3. `curl -I https://aimlead.io` returns 200 with `X-AimLeads-*` headers
4. `curl -I https://www.aimlead.io` returns a 308 redirect to `https://aimlead.io`
5. opening `https://aimlead.io` shows the same build stamp as the API
6. landing page loads on desktop and mobile
7. login works
8. one authenticated page loads without a 401 loop

## 6. Troubleshooting

| Symptom | Check |
| --- | --- |
| Panel: "pull access denied for aimleads" | You're deploying an old compose file — pull the latest repo state (`pull_policy: build` must be present) |
| Caddy won't start / port conflict | `docker ps` — an old Traefik/nginx still holds 80/443; remove it (section 0) |
| HTTPS certificate errors | DNS not pointing at this VPS yet, or port 80 blocked (Let's Encrypt needs it); `docker logs aimleads-caddy` |
| App container restarts in a loop | `docker logs aimleads --tail=100` — usually a missing required `.env` value (SESSION_SECRET, SUPABASE_*) |
| health returns `"status":"degraded"` | Supabase unreachable or wrong keys in `.env` |
| Site serves an old build | Rebuild with `--no-cache`, then hard-refresh; verify `X-AimLeads-Commit` header matches `git rev-parse --short HEAD` |

Useful commands:

```bash
docker compose ps
docker logs aimleads --tail=200
docker logs aimleads-caddy --tail=100
curl -fsS http://127.0.0.1:3010/api/health
```

## 7. Smoke test checklist

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
