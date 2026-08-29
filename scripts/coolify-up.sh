#!/bin/bash
# ============================================================
#  scripts/coolify-up.sh — Start/configure the HomiOS-managed Coolify sidecar
#
#  FAIL-CLOSED: This script refuses to execute unless:
#    COOLIFY_MODE=managed  AND  COOLIFY_OWNED_BY_HOMIOS=true
#
#  The orchestrator (install.sh) is the sole authority on whether an
#  installation is fresh. This script never decides ownership — it only
#  executes when the orchestrator has already confirmed both preconditions.
#
#  Defaults are set to the most restrictive values to prevent accidental
#  execution from a shell where these variables are unset.
# ============================================================
set -euo pipefail

COOLIFY_APP_PORT="${COOLIFY_APP_PORT:-8000}"
COOLIFY_DATA_DIR="${COOLIFY_DATA_DIR:-/data/coolify}"
HOMIOS_STORAGE_ROOT="${HOMIOS_STORAGE_ROOT:-${HOMIOS_DRIVE_MOUNT_ROOT:-/mnt/homios-storage}}"
COOLIFY_VERSION="${COOLIFY_VERSION:-4.1.2}"
COOLIFY_VERSION="${COOLIFY_VERSION#v}"
COOLIFY_AUTOUPDATE="${COOLIFY_AUTOUPDATE:-false}"
COOLIFY_ARTIFACT_BASE_URL="${COOLIFY_ARTIFACT_BASE_URL:-https://raw.githubusercontent.com/coollabsio/coolify/v${COOLIFY_VERSION}}"
HOMIOS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOMIOS_COMPOSE_TEMPLATE="$HOMIOS_ROOT/deploy/coolify/docker-compose.homios.yml"
ENV_DIR="$COOLIFY_DATA_DIR/source"
ENV_FILE="$ENV_DIR/.env"
ENV_TEMPLATE="$ENV_DIR/.env.production"
BASE_COMPOSE_FILE="$ENV_DIR/docker-compose.yml"
PROD_COMPOSE_FILE="$ENV_DIR/docker-compose.prod.yml"
HOMIOS_COMPOSE_FILE="$ENV_DIR/docker-compose.homios.yml"

log()  { echo "[coolify] $1"; }
fail() { echo "[coolify] ERROR: $1" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo bash scripts/coolify-up.sh"
fi

# ── Ownership guard — fail-closed ─────────────────────────────
# COOLIFY_MODE defaults to 'disabled', not 'managed', so unintentional execution
# from an unconfigured environment is always a hard failure, never a silent proceed.
#
# Both conditions must be true before any Coolify installation or lifecycle
# operation is performed. The orchestrator (install.sh) sets these before invoking
# this script. If they are not set, refuse.
if [ "${COOLIFY_MODE:-disabled}" != "managed" ]; then
  fail "Coolify lifecycle operations require COOLIFY_MODE=managed.
Got: '${COOLIFY_MODE:-disabled}'.
This script must only be called by install.sh in managed Coolify mode."
fi
if [ "${COOLIFY_OWNED_BY_HOMIOS:-false}" != "true" ]; then
  fail "HomiOS does not own this Coolify installation (COOLIFY_OWNED_BY_HOMIOS is not true).
Refusing to install or reconfigure Coolify.
Use --existing-coolify to integrate with an externally installed Coolify instance."
fi
# Both guards passed — proceeding with managed installation.

if [[ ! "$COOLIFY_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  fail "Invalid COOLIFY_VERSION '$COOLIFY_VERSION'. Use a release such as 4.1.2."
fi
if [[ "$COOLIFY_AUTOUPDATE" != "true" && "$COOLIFY_AUTOUPDATE" != "false" ]]; then
  fail "COOLIFY_AUTOUPDATE must be true or false."
fi
if [[ "$COOLIFY_DATA_DIR" != /* || "$HOMIOS_STORAGE_ROOT" != /* ]]; then
  fail "COOLIFY_DATA_DIR and HOMIOS_STORAGE_ROOT must be absolute Linux paths."
fi
if [[ "$COOLIFY_DATA_DIR" == *'|'* ]]; then
  fail "COOLIFY_DATA_DIR cannot contain a pipe character."
fi
if [ ! -f "$HOMIOS_COMPOSE_TEMPLATE" ]; then
  fail "HomiOS Coolify Compose override not found at $HOMIOS_COMPOSE_TEMPLATE"
fi

if ! command -v docker > /dev/null 2>&1; then
  log "Installing Docker for the bundled Coolify sidecar..."
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable docker --quiet 2>/dev/null || true
  systemctl start docker --quiet 2>/dev/null || true
fi

if docker compose version > /dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  fail "Docker Compose is not available after Docker installation"
fi

if ! docker network inspect coolify > /dev/null 2>&1; then
  log "Creating Coolify Docker network..."
  docker network create coolify > /dev/null
fi

mkdir -p \
  "$HOMIOS_STORAGE_ROOT" \
  "$ENV_DIR" \
  "$COOLIFY_DATA_DIR/ssh/keys" \
  "$COOLIFY_DATA_DIR/ssh/mux" \
  "$COOLIFY_DATA_DIR/applications" \
  "$COOLIFY_DATA_DIR/databases" \
  "$COOLIFY_DATA_DIR/services" \
  "$COOLIFY_DATA_DIR/backups"

download_artifact() {
  local name="$1"
  local destination="$2"
  local temporary
  temporary=$(mktemp "${destination}.XXXXXX")
  if ! curl -fsSL --retry 3 --retry-delay 2 \
    "$COOLIFY_ARTIFACT_BASE_URL/$name" -o "$temporary"; then
    rm -f "$temporary"
    fail "Could not download official Coolify artifact: $name"
  fi
  mv "$temporary" "$destination"
}

log "Downloading official Coolify $COOLIFY_VERSION deployment artifacts..."
download_artifact "docker-compose.yml" "$BASE_COMPOSE_FILE"
download_artifact "docker-compose.prod.yml" "$PROD_COMPOSE_FILE"
download_artifact ".env.production" "$ENV_TEMPLATE"
cp "$HOMIOS_COMPOSE_TEMPLATE" "$HOMIOS_COMPOSE_FILE"
# Official files use /data/coolify. Preserve HomiOS's existing configurable
# data root without carrying a fork of those files.
sed -i "s|/data/coolify|$COOLIFY_DATA_DIR|g" "$PROD_COMPOSE_FILE"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_TEMPLATE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  # Preserve secrets and operator choices while adding newly introduced
  # upstream variables with their official defaults.
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key="${line%%=*}"
    if ! grep -q "^${key}=" "$ENV_FILE"; then
      printf '%s\n' "$line" >> "$ENV_FILE"
    fi
  done < "$ENV_TEMPLATE"
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

set_env_value() {
  local key="$1"
  local value="$2"
  local temporary
  temporary=$(mktemp "${ENV_FILE}.XXXXXX")
  grep -v "^${key}=" "$ENV_FILE" > "$temporary" || true
  printf '%s=%s\n' "$key" "$value" >> "$temporary"
  mv "$temporary" "$ENV_FILE"
}

default_host() {
  hostname -I 2>/dev/null | awk '{print $1}' | grep -E '.+' || echo "localhost"
}

set_env_default "APP_ID" "$(openssl rand -hex 16)"
set_env_default "APP_NAME" "Coolify"
set_env_default "APP_KEY" "base64:$(openssl rand -base64 32)"
set_env_value "APP_PORT" "$COOLIFY_APP_PORT"
set_env_default "APP_URL" "${COOLIFY_APP_URL:-http://$(default_host):$COOLIFY_APP_PORT}"
set_env_default "DB_USERNAME" "coolify"
set_env_default "DB_PASSWORD" "$(openssl rand -base64 32)"
set_env_default "REDIS_PASSWORD" "$(openssl rand -base64 32)"
set_env_default "PUSHER_APP_ID" "$(openssl rand -hex 32)"
set_env_default "PUSHER_APP_KEY" "$(openssl rand -hex 32)"
set_env_default "PUSHER_APP_SECRET" "$(openssl rand -hex 32)"
set_env_default "REGISTRY_URL" "${REGISTRY_URL:-ghcr.io}"
set_env_value "LATEST_IMAGE" "$COOLIFY_VERSION"
set_env_value "AUTOUPDATE" "$COOLIFY_AUTOUPDATE"
set_env_value "HOMIOS_STORAGE_ROOT" "$HOMIOS_STORAGE_ROOT"

if [ -n "${ROOT_USERNAME:-}" ] && [ -n "${ROOT_USER_EMAIL:-}" ] && [ -n "${ROOT_USER_PASSWORD:-}" ]; then
  set_env_default "ROOT_USERNAME" "$ROOT_USERNAME"
  set_env_default "ROOT_USER_EMAIL" "$ROOT_USER_EMAIL"
  set_env_default "ROOT_USER_PASSWORD" "$ROOT_USER_PASSWORD"
fi

chown -R 9999:root "$COOLIFY_DATA_DIR"
chmod -R 700 "$COOLIFY_DATA_DIR"

# ── SSH: Ensure openssh-server is installed and running ──────────────────────
# Coolify connects to "This Machine" via SSH on localhost.
# Without sshd running, the localhost validation always fails.
log "Ensuring openssh-server is installed and active..."
if ! command -v sshd > /dev/null 2>&1; then
  apt-get install -y openssh-server > /dev/null 2>&1
fi
systemctl enable ssh  > /dev/null 2>&1 || true
systemctl start  ssh  > /dev/null 2>&1 || true

# Allow root login via key (required for Coolify's localhost validation).
SSHD_CFG="/etc/ssh/sshd_config"
if grep -qE '^PermitRootLogin\s+no' "$SSHD_CFG" 2>/dev/null; then
  sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CFG"
  systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
elif ! grep -qE '^PermitRootLogin' "$SSHD_CFG" 2>/dev/null; then
  echo 'PermitRootLogin prohibit-password' >> "$SSHD_CFG"
  systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
fi

# ── SSH: Authorize Coolify's key on the host (generate if missing) ───────────
# Coolify requires this specific SSH key to connect to "This Machine".
# The official installer generates it explicitly before the app uses it.
COOLIFY_SSH_DIR="$COOLIFY_DATA_DIR/ssh/keys"
SSH_KEY_NAME="id.root@host.docker.internal"
SSH_KEY_PATH="$COOLIFY_SSH_DIR/$SSH_KEY_NAME"
AUTH_KEYS="/root/.ssh/authorized_keys"

mkdir -p "$COOLIFY_SSH_DIR"
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

if [ ! -f "$SSH_KEY_PATH" ]; then
  log "Generating Coolify SSH key for localhost validation..."
  ssh-keygen -t ed25519 -a 100 -f "$SSH_KEY_PATH" -q -N "" -C "root@coolify"
  chown 9999:root "$SSH_KEY_PATH"
  chmod 600 "$SSH_KEY_PATH"
else
  log "Coolify SSH key already exists."
fi

pubkey=$(cat "$SSH_KEY_PATH.pub")
if ! grep -qF "$pubkey" "$AUTH_KEYS"; then
  echo "$pubkey" >> "$AUTH_KEYS"
  log "Authorized Coolify SSH key in root's authorized_keys."
else
  log "Coolify SSH key is already authorized."
fi

log "Starting Coolify on port $COOLIFY_APP_PORT..."
"${COMPOSE[@]}" \
  --env-file "$ENV_FILE" \
  -f "$BASE_COMPOSE_FILE" \
  -f "$PROD_COMPOSE_FILE" \
  -f "$HOMIOS_COMPOSE_FILE" \
  up -d --pull always --remove-orphans --force-recreate

log "Coolify is available at http://$(default_host):$COOLIFY_APP_PORT"

log "Testing Coolify SSH access to localhost..."
if docker exec coolify bash -c "ssh -i /var/www/html/storage/app/ssh/keys/id.root@host.docker.internal -p 22 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 root@host.docker.internal echo 'SSH test successful'" > /dev/null 2>&1; then
  log "✅ Localhost SSH validation passed! 'This Machine' will work."
else
  log "❌ WARNING: Localhost SSH validation failed. Coolify may not be able to connect to 'This Machine'."
  log "Check if a firewall (like UFW) is blocking traffic from Docker to the host on port 22."
fi
