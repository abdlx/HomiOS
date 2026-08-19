#!/bin/bash
# ============================================================
#  scripts/coolify-down.sh — Stop the OpenFinder-managed Coolify sidecar
#
#  FAIL-CLOSED: This script refuses to execute unless:
#    COOLIFY_MODE=managed  AND  COOLIFY_OWNED_BY_OPENFINDER=true
#
#  It will NEVER stop an externally installed Coolify instance.
#  Defaults are set to the most restrictive values to prevent accidental
#  execution from a shell where these variables are unset.
# ============================================================
set -euo pipefail

COOLIFY_DATA_DIR="${COOLIFY_DATA_DIR:-/data/coolify}"
COOLIFY_SOURCE_DIR="${COOLIFY_SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/coolify}"
ENV_FILE="$COOLIFY_DATA_DIR/source/.env"

fail() { echo "[coolify] ERROR: $1" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo bash scripts/coolify-down.sh"
fi

# ── Ownership guard — fail-closed ─────────────────────────────
# COOLIFY_MODE defaults to 'disabled', not 'managed', so unintentional execution
# from an unconfigured environment is always a hard failure, never a silent proceed.
#
# Both conditions must be true before Coolify containers are stopped.
# This script must never be called automatically on --without-coolify.
if [ "${COOLIFY_MODE:-disabled}" != "managed" ]; then
  fail "Coolify lifecycle operations require COOLIFY_MODE=managed.
Got: '${COOLIFY_MODE:-disabled}'.
OpenFinder will not stop a Coolify instance it does not manage."
fi
if [ "${COOLIFY_OWNED_BY_OPENFINDER:-false}" != "true" ]; then
  fail "OpenFinder does not own this Coolify installation (COOLIFY_OWNED_BY_OPENFINDER is not true).
Refusing to stop Coolify.
In external mode, Coolify lifecycle operations are read-only."
fi
# Both guards passed — proceeding with managed teardown.

if [ ! -d "$COOLIFY_SOURCE_DIR" ]; then
  fail "Coolify source directory not found at $COOLIFY_SOURCE_DIR"
fi

if docker compose version > /dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose > /dev/null 2>&1; then
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
