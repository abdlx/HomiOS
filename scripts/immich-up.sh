#!/bin/bash
set -euo pipefail

IMMICH_DATA_DIR="${IMMICH_DATA_DIR:-/data/immich}"
IMMICH_APP_PORT="${IMMICH_APP_PORT:-2283}"
IMMICH_VERSION="${IMMICH_VERSION:-v3}"
IMMICH_COMPOSE_URL="${IMMICH_COMPOSE_URL:-https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml}"
COMPOSE_FILE="$IMMICH_DATA_DIR/docker-compose.yml"
ENV_FILE="$IMMICH_DATA_DIR/.env"

log() { echo "[immich] $1"; }
fail() { echo "[immich] ERROR: $1" >&2; exit 1; }

[ "$EUID" -eq 0 ] || fail "Please run as root: sudo bash scripts/immich-up.sh"
[[ "$IMMICH_APP_PORT" =~ ^[0-9]+$ ]] && [ "$IMMICH_APP_PORT" -ge 1 ] && [ "$IMMICH_APP_PORT" -le 65535 ] || fail "IMMICH_APP_PORT must be between 1 and 65535"

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable --now docker --quiet 2>/dev/null || true
fi
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required"

mkdir -p "$IMMICH_DATA_DIR/library" "$IMMICH_DATA_DIR/postgres"
chmod 700 "$IMMICH_DATA_DIR"

if [ ! -f "$ENV_FILE" ]; then
  umask 077
  cat > "$ENV_FILE" <<EOF
UPLOAD_LOCATION=$IMMICH_DATA_DIR/library
DB_DATA_LOCATION=$IMMICH_DATA_DIR/postgres
IMMICH_VERSION=$IMMICH_VERSION
DB_PASSWORD=$(openssl rand -hex 32)
DB_USERNAME=postgres
DB_DATABASE_NAME=immich
IMMICH_APP_PORT=$IMMICH_APP_PORT
EOF
  umask 022
else
  grep -q '^IMMICH_APP_PORT=' "$ENV_FILE" && sed -i "s/^IMMICH_APP_PORT=.*/IMMICH_APP_PORT=$IMMICH_APP_PORT/" "$ENV_FILE" || printf 'IMMICH_APP_PORT=%s\n' "$IMMICH_APP_PORT" >> "$ENV_FILE"
  grep -q '^IMMICH_VERSION=' "$ENV_FILE" && sed -i "s/^IMMICH_VERSION=.*/IMMICH_VERSION=$IMMICH_VERSION/" "$ENV_FILE" || printf 'IMMICH_VERSION=%s\n' "$IMMICH_VERSION" >> "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

tmp_compose=$(mktemp "$IMMICH_DATA_DIR/docker-compose.yml.XXXXXX")
trap 'rm -f "$tmp_compose"' EXIT
log "Downloading the current official Immich release Compose file..."
curl -fL --retry 3 --connect-timeout 15 "$IMMICH_COMPOSE_URL" -o "$tmp_compose"

# The official bundle fixes the host port at 2283. Keep its container port while
# allowing OpenFinder's optional service port to be configured in .env.
if grep -qE "['\"]?2283:2283['\"]?" "$tmp_compose"; then
  sed -i -E "s/(['\"]?)2283:2283(['\"]?)/\1\${IMMICH_APP_PORT:-2283}:2283\2/" "$tmp_compose"
else
  fail "Official Compose port mapping changed; refusing to install an unverified bundle"
fi

[ ! -f "$COMPOSE_FILE" ] || cp "$COMPOSE_FILE" "$COMPOSE_FILE.previous"
mv "$tmp_compose" "$COMPOSE_FILE"
trap - EXIT
chmod 600 "$COMPOSE_FILE"

log "Pulling and starting Immich $IMMICH_VERSION on port $IMMICH_APP_PORT..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" pull
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans
log "Immich is available at http://$(hostname -I 2>/dev/null | awk '{print $1}'):$IMMICH_APP_PORT"
