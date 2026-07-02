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

# ── SSH: Ensure openssh-server is installed and running ──────────────────────
# Coolify connects to "This Machine" via SSH on localhost.
# Without sshd running, the localhost validation always fails.
log "Ensuring openssh-server is installed and active..."
if ! command -v sshd >/dev/null 2>&1; then
  apt-get install -y openssh-server >/dev/null 2>&1
fi
systemctl enable ssh  >/dev/null 2>&1 || true
systemctl start  ssh  >/dev/null 2>&1 || true

# Allow root login via key (required for Coolify's localhost validation).
# We only touch PermitRootLogin if it is currently set to 'no'.
SSHD_CFG="/etc/ssh/sshd_config"
if grep -qE '^PermitRootLogin\s+no' "$SSHD_CFG" 2>/dev/null; then
  sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CFG"
  systemctl reload ssh 2>/dev/null || true
elif ! grep -qE '^PermitRootLogin' "$SSHD_CFG" 2>/dev/null; then
  echo 'PermitRootLogin prohibit-password' >> "$SSHD_CFG"
  systemctl reload ssh 2>/dev/null || true
fi

# ── SSH: Authorize Coolify's auto-generated key on the host ──────────────────
# Coolify generates an SSH key pair at startup and uses it to talk to
# "This Machine" (localhost). We wait up to 30 s for the key to appear,
# then append it to root's authorized_keys so validation succeeds.
COOLIFY_SSH_DIR="$COOLIFY_DATA_DIR/ssh/keys"
COOLIFY_PUBKEY_GLOB="$COOLIFY_SSH_DIR/id.root@host.docker.internal.pub"
AUTH_KEYS="/root/.ssh/authorized_keys"

mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

log "Waiting for Coolify to generate its SSH key (up to 30 s)..."
for i in $(seq 1 30); do
  if ls $COOLIFY_PUBKEY_GLOB >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ls $COOLIFY_PUBKEY_GLOB >/dev/null 2>&1; then
  for pubkey_file in $COOLIFY_PUBKEY_GLOB; do
    pubkey=$(cat "$pubkey_file")
    if ! grep -qF "$pubkey" "$AUTH_KEYS"; then
      echo "$pubkey" >> "$AUTH_KEYS"
      log "Authorized Coolify SSH key: $(basename $pubkey_file)"
    else
      log "Coolify SSH key already authorized: $(basename $pubkey_file)"
    fi
  done
else
  log "WARNING: Coolify SSH key not found after 30 s. Run this script again after Coolify has fully started."
fi
