#!/bin/bash
set -euo pipefail

COOLIFY_DATA_DIR="${COOLIFY_DATA_DIR:-/data/coolify}"
COOLIFY_SOURCE_DIR="${COOLIFY_SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/coolify}"
ENV_FILE="$COOLIFY_DATA_DIR/source/.env"

fail() { echo "[coolify] ERROR: $1" >&2; exit 1; }

if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo bash scripts/coolify-down.sh"
fi

if [ ! -d "$COOLIFY_SOURCE_DIR" ]; then
  fail "Coolify source directory not found at $COOLIFY_SOURCE_DIR"
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  fail "Docker Compose is not available"
fi

ARGS=()
if [ -f "$ENV_FILE" ]; then
  ARGS+=(--env-file "$ENV_FILE")
fi

"${COMPOSE[@]}" \
  "${ARGS[@]}" \
  -f "$COOLIFY_SOURCE_DIR/docker-compose.yml" \
  -f "$COOLIFY_SOURCE_DIR/docker-compose.prod.yml" \
  stop

echo "[coolify] Coolify stopped. Volumes and /data/coolify were preserved."
