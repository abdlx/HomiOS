#!/usr/bin/env bash
set -euo pipefail

# Managed-Coolify credential bootstrapping is deliberately isolated here. HomiOS
# currently supports the documented token flow and refuses to mutate Coolify's
# internal database on unknown versions. A provisioner may pass a short-lived
# token through COOLIFY_BOOTSTRAP_TOKEN. This helper writes it only to a
# caller-selected 0600 EnvironmentFile; it never prints the token to stdout.

MIN_MAJOR=4
COOLIFY_URL="${COOLIFY_URL:-http://127.0.0.1:${COOLIFY_APP_PORT:-8000}}"
VERSION="${COOLIFY_VERSION:-}"
OUTPUT_FILE="${1:-}"

if [[ -n "$VERSION" && ! "$VERSION" =~ ^v?${MIN_MAJOR}([.-]|$) ]]; then
  echo "Unsupported Coolify version: $VERSION. Use the manual API-token fallback." >&2
  exit 3
fi

if [[ -z "${COOLIFY_BOOTSTRAP_TOKEN:-}" ]]; then
  echo "Coolify's documented flow requires an API token. Create one with read, write, deploy permissions and connect it in HomiOS." >&2
  exit 2
fi

if [[ -z "$OUTPUT_FILE" || "$OUTPUT_FILE" != /* ]]; then
  echo "Usage: coolify-bootstrap-api.sh /absolute/path/to/homios.env" >&2
  exit 64
fi

OUTPUT_DIR="$(dirname -- "$OUTPUT_FILE")"
if [[ ! -d "$OUTPUT_DIR" ]]; then
  echo "Output directory does not exist: $OUTPUT_DIR" >&2
  exit 66
fi

umask 077
TEMP_FILE="$(mktemp "$OUTPUT_DIR/.coolify-api.XXXXXX")"
trap 'rm -f -- "$TEMP_FILE"' EXIT

# Preserve unrelated HomiOS settings while replacing any stale integration
# values. The file remains mode 0600 throughout the atomic replacement.
if [[ -f "$OUTPUT_FILE" ]]; then
  grep -vE '^(COOLIFY_URL|COOLIFY_API_TOKEN)=' "$OUTPUT_FILE" > "$TEMP_FILE"
fi
printf 'COOLIFY_URL=%s\nCOOLIFY_API_TOKEN=%s\n' "$COOLIFY_URL" "$COOLIFY_BOOTSTRAP_TOKEN" >> "$TEMP_FILE"
chmod 600 "$TEMP_FILE"
mv -f -- "$TEMP_FILE" "$OUTPUT_FILE"
trap - EXIT

echo "Coolify API credentials stored securely in $OUTPUT_FILE"
