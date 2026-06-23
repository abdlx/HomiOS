#!/bin/bash
set -euo pipefail

COOLIFY_APP_PORT="${COOLIFY_APP_PORT:-8000}"
COOLIFY_DATA_DIR="${COOLIFY_DATA_DIR:-/data/coolify}"
COOLIFY_SOURCE_DIR="${COOLIFY_SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/coolify}"
COOLIFY_BUILD_LOCAL="${COOLIFY_BUILD_LOCAL:-false}"
if [ "$COOLIFY_BUILD_LOCAL" = "true" ]; then
  COOLIFY_IMAGE="${COOLIFY_IMAGE:-openfinder/coolify:local}"
else
  COOLIFY_IMAGE="${COOLIFY_IMAGE:-ghcr.io/coollabsio/coolify:latest}"
fi
ENV_DIR="$COOLIFY_DATA_DIR/source"
ENV_FILE="$ENV_DIR/.env"
ENV_TEMPLATE="$COOLIFY_SOURCE_DIR/.env.production"

log() { echo "[coolify] $1"; }
fail() { echo "[coolify] ERROR: $1" >&2; exit 1; }

if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo bash scripts/coolify-up.sh"
fi

if [ ! -d "$COOLIFY_SOURCE_DIR" ]; then
  fail "Coolify source directory not found at $COOLIFY_SOURCE_DIR"
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker for the bundled Coolify sidecar..."
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable docker --quiet 2>/dev/null || true
  systemctl start docker --quiet 2>/dev/null || true
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  fail "Docker Compose is not available after Docker installation"
fi

if ! docker network inspect coolify >/dev/null 2>&1; then
  log "Creating Coolify Docker network..."
  docker network create coolify >/dev/null
fi

mkdir -p \
  "$ENV_DIR" \
  "$COOLIFY_DATA_DIR/ssh" \
  "$COOLIFY_DATA_DIR/applications" \
  "$COOLIFY_DATA_DIR/databases" \
  "$COOLIFY_DATA_DIR/services" \
  "$COOLIFY_DATA_DIR/backups"

if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ENV_TEMPLATE" ]; then
    cp "$ENV_TEMPLATE" "$ENV_FILE"
  else
    touch "$ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
fi

set_env_default() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=$" "$ENV_FILE"; then
    sed -i "s|^${key}=$|${key}=${value}|" "$ENV_FILE"
  elif ! grep -q "^${key}=" "$ENV_FILE"; then
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

default_host() {
  hostname -I 2>/dev/null | awk '{print $1}' | grep -E '.+' || echo "localhost"
}

set_env_default "APP_ID" "$(openssl rand -hex 16)"
set_env_default "APP_NAME" "Coolify"
set_env_default "APP_KEY" "base64:$(openssl rand -base64 32)"
set_env_default "APP_PORT" "$COOLIFY_APP_PORT"
set_env_default "APP_URL" "${COOLIFY_APP_URL:-http://$(default_host):$COOLIFY_APP_PORT}"
set_env_default "DB_USERNAME" "coolify"
set_env_default "DB_PASSWORD" "$(openssl rand -base64 32)"
set_env_default "REDIS_PASSWORD" "$(openssl rand -base64 32)"
set_env_default "PUSHER_APP_ID" "$(openssl rand -hex 32)"
set_env_default "PUSHER_APP_KEY" "$(openssl rand -hex 32)"
set_env_default "PUSHER_APP_SECRET" "$(openssl rand -hex 32)"
set_env_default "REGISTRY_URL" "${REGISTRY_URL:-ghcr.io}"
set_env_default "COOLIFY_BUILD_LOCAL" "$COOLIFY_BUILD_LOCAL"
set_env_default "COOLIFY_IMAGE" "$COOLIFY_IMAGE"

if [ -n "${ROOT_USERNAME:-}" ] && [ -n "${ROOT_USER_EMAIL:-}" ] && [ -n "${ROOT_USER_PASSWORD:-}" ]; then
  set_env_default "ROOT_USERNAME" "$ROOT_USERNAME"
  set_env_default "ROOT_USER_EMAIL" "$ROOT_USER_EMAIL"
  set_env_default "ROOT_USER_PASSWORD" "$ROOT_USER_PASSWORD"
fi

if [ "$COOLIFY_BUILD_LOCAL" = "true" ]; then
  log "Building OpenFinder-themed Coolify image ($COOLIFY_IMAGE)..."
  docker build \
    -f "$COOLIFY_SOURCE_DIR/docker/production/Dockerfile" \
    -t "$COOLIFY_IMAGE" \
    "$COOLIFY_SOURCE_DIR"
fi

log "Starting Coolify on port $COOLIFY_APP_PORT..."
"${COMPOSE[@]}" \
  --env-file "$ENV_FILE" \
  -f "$COOLIFY_SOURCE_DIR/docker-compose.yml" \
  -f "$COOLIFY_SOURCE_DIR/docker-compose.prod.yml" \
  up -d

log "Coolify is available at http://$(default_host):$COOLIFY_APP_PORT"
