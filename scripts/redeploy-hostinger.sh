#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NO_CACHE=0
if [[ "${1:-}" == "--no-cache" ]]; then
  NO_CACHE=1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required on the target host." >&2
  exit 1
fi

APP_VERSION="${APP_VERSION:-$(date -u +'%Y.%m.%d-%H%M')}"
APP_BUILD_TIME="${APP_BUILD_TIME:-$(date -u +'%Y-%m-%dT%H:%M:%SZ')}"
APP_COMMIT_SHA="${APP_COMMIT_SHA:-$(git rev-parse --short HEAD 2>/dev/null || echo local)}"

export APP_VERSION APP_BUILD_TIME APP_COMMIT_SHA

echo "Deploying AimLeads"
echo "  APP_VERSION=$APP_VERSION"
echo "  APP_BUILD_TIME=$APP_BUILD_TIME"
echo "  APP_COMMIT_SHA=$APP_COMMIT_SHA"

BUILD_ARGS=(compose build --pull app)
if [[ "$NO_CACHE" -eq 1 ]]; then
  BUILD_ARGS=(compose build --pull --no-cache app)
fi

docker "${BUILD_ARGS[@]}"
docker compose up -d --force-recreate --remove-orphans app

echo "Waiting for app health endpoint..."
sleep 5
LOCAL_HEALTH_URL="http://127.0.0.1:3010/api/health?ts=$(date -u +'%s')"
PUBLIC_HEALTH_URL="${APP_PUBLIC_URL:-https://aimlead.io}/api/health?ts=$(date -u +'%s')"

curl -fsS "$LOCAL_HEALTH_URL" || {
  echo
  echo "Health check failed after deploy." >&2
  exit 1
}
echo

echo "Public health check (best effort)..."
if ! curl -fsS "$PUBLIC_HEALTH_URL"; then
  echo
  echo "Public health check failed. Verify Traefik routing, DNS, and HTTPS reachability." >&2
fi
echo
echo "Verifying public build markers..."
if ! APP_PUBLIC_URL="${APP_PUBLIC_URL:-https://aimlead.io}" APP_VERSION="$APP_VERSION" APP_COMMIT_SHA="$APP_COMMIT_SHA" node scripts/verify-live-deploy.mjs; then
  echo
  echo "Public build verification failed. The VPS may still be serving an old build or missing headers/meta tags." >&2
fi
echo
echo "Redeploy complete."
