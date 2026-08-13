#!/bin/bash
set -euo pipefail

IMMICH_DATA_DIR="${IMMICH_DATA_DIR:-/data/immich}"
COMPOSE_FILE="$IMMICH_DATA_DIR/docker-compose.yml"
ENV_FILE="$IMMICH_DATA_DIR/.env"

[ "$EUID" -eq 0 ] || { echo "[immich] ERROR: run as root" >&2; exit 1; }
[ -f "$COMPOSE_FILE" ] || { echo "[immich] No installation found at $IMMICH_DATA_DIR"; exit 0; }
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop
echo "[immich] Immich stopped. Library and database data were preserved in $IMMICH_DATA_DIR."
