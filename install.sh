#!/bin/bash
# ============================================================
#  HomiOS — Production Bare-Metal Installer
#  Targets: Ubuntu 22.04+ / Debian 12+
#  Architecture: Nginx → Node.js/Express + Next.js (SSR)
# ============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}✅ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; exit 1; }

# Trap any error with the line number so failures are never silent
cleanup_on_failure() {
  echo -e "\n${RED}${BOLD}❌ Installation failed at line $1.${NC}"
  echo -e "${RED}   Rolling back systemd service if it was started...${NC}"
  systemctl stop homios 2>/dev/null || true
  echo -e "${YELLOW}   Run: journalctl -u homios -n 50 for logs.${NC}"
  exit 1
}
trap 'cleanup_on_failure $LINENO' ERR

# ── Root check ────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  fail "Please run as root: sudo bash install.sh"
fi

# ── CLI option defaults ───────────────────────────────────────
# COOLIFY_MODE: managed | external | disabled
#   managed   = HomiOS installs, owns, and manages Coolify.
#   external  = Coolify is already running independently. HomiOS is a
#               read-only guest: no install, no restart, no reconfigure.
#   disabled  = No Coolify integration. HomiOS does not start, stop,
#               or configure Coolify, and never touches an existing instance.
#
# COOLIFY_OWNED_BY_HOMIOS: true | false
#   true  = This HomiOS installation is the one that created Coolify.
#           Lifecycle operations (up/down) are permitted.
#   false = Ownership is unconfirmed or Coolify belongs to an external operator.
#           Lifecycle operations are blocked at the helper script level.
#
# HOMIOS_PROXY_MODE: nginx | external | none
#   nginx    = HomiOS installs host Nginx and binds port 80.
#   external = An existing proxy (Coolify/Traefik/Caddy/etc) owns 80/443.
#              HomiOS will NOT touch host Nginx.
#   none     = No reverse proxy; HomiOS runs on its app port only.

COOLIFY_MODE="${COOLIFY_MODE:-}"
COOLIFY_OWNED_BY_HOMIOS="${COOLIFY_OWNED_BY_HOMIOS:-}"
COOLIFY_INTEGRATION_ENABLED="${COOLIFY_INTEGRATION_ENABLED:-}"
COOLIFY_APP_PORT="${COOLIFY_APP_PORT:-8000}"
COOLIFY_DATA_DIR="${COOLIFY_DATA_DIR:-/data/coolify}"
CODEX_UI_ENABLED="${CODEX_UI_ENABLED:-false}"
HOMIOS_PROXY_MODE="${HOMIOS_PROXY_MODE:-}"
IMMICH_ENABLED="${IMMICH_ENABLED:-}"
# HOMIOS_PORT is the canonical HomiOS application port.
# It can be overridden by the user; the default is 8740.
HOMIOS_PORT="${HOMIOS_PORT:-}"
NON_INTERACTIVE=false

# Track which Coolify flags were explicitly supplied for mutual-exclusion checks.
_FLAG_WITH_COOLIFY=false
_FLAG_EXISTING_COOLIFY=false
_FLAG_WITHOUT_COOLIFY=false

show_help() {
  cat <<HELP
Usage: sudo bash install.sh [OPTIONS]

Coolify options (mutually exclusive — pick at most one):
  --with-coolify        HomiOS installs and manages a bundled Coolify instance.
                        Fails if an unowned Coolify is already detected on the host.
  --existing-coolify    Coolify is already running on this host. HomiOS will
                        detect it in read-only mode and will NOT install, restart,
                        reconfigure, or stop it. Implies external proxy mode (host
                        Nginx will NOT be installed or reconfigured).
  --without-coolify     No Coolify integration. HomiOS does not start, stop, or
                        configure Coolify. Does NOT shut down an existing instance.

Optional components:
  --with-codex-ui       Install the Codex Web UI sidecar (default: skipped).
                        Codex Web UI is no longer installed by default.
  --with-immich         Enable optional Immich photo library service.
  --without-immich      Disable optional Immich service.

General:
  --non-interactive     Skip all interactive prompts. Unset optional services
                        default to disabled.
  -h, --help            Show this help message and exit.

Examples:
  # Managed Coolify — HomiOS installs and owns it:
  sudo bash install.sh --with-coolify --non-interactive

  # Existing external Coolify already running on this host:
  sudo bash install.sh --existing-coolify --non-interactive

  # Existing external Coolify + optional Codex UI:
  sudo bash install.sh --existing-coolify --with-codex-ui --non-interactive

  # No Coolify integration:
  sudo bash install.sh --without-coolify --non-interactive
HELP
}

MIGRATE_HOMIOS_PORT=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --with-coolify)
      COOLIFY_MODE=managed
      _FLAG_WITH_COOLIFY=true
      ;;
    --existing-coolify)
      COOLIFY_MODE=external
      HOMIOS_PROXY_MODE=external
      _FLAG_EXISTING_COOLIFY=true
      ;;
    --without-coolify)
      COOLIFY_MODE=disabled
      _FLAG_WITHOUT_COOLIFY=true
      ;;
    --with-immich)     IMMICH_ENABLED=true ;;
    --without-immich)  IMMICH_ENABLED=false ;;
    --with-codex-ui)   CODEX_UI_ENABLED=true ;;
    --migrate-homios-port) MIGRATE_HOMIOS_PORT=true ;;
    --non-interactive) NON_INTERACTIVE=true ;;
    -h|--help)         show_help; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
  shift
done

# Mutually exclusive flag checks
if [ "$_FLAG_WITH_COOLIFY" = "true" ] && [ "$_FLAG_EXISTING_COOLIFY" = "true" ]; then
  fail "--with-coolify and --existing-coolify are mutually exclusive."
fi
if [ "$_FLAG_WITHOUT_COOLIFY" = "true" ] && [ "$_FLAG_EXISTING_COOLIFY" = "true" ]; then
  fail "--without-coolify and --existing-coolify are mutually exclusive."
fi
if [ "$_FLAG_WITH_COOLIFY" = "true" ] && [ "$_FLAG_WITHOUT_COOLIFY" = "true" ]; then
  fail "--with-coolify and --without-coolify are mutually exclusive."
fi

normalize_bool() {
  case "${1,,}" in
    1|true|yes|y|on) echo true ;;
    0|false|no|n|off|'') echo false ;;
    *) fail "Expected a boolean value, got: $1" ;;
  esac
}

ask_optional() {
  local label="$1"
  local answer
  read -r -p "Install optional $label service? [y/N] " answer
  normalize_bool "$answer"
}

echo -e "${BOLD}"
echo " ██╗  ██╗ ██████╗ ███╗   ███╗██╗ ██████╗ ███████╗"
echo " ██║  ██║██╔═══██╗████╗ ████║██║██╔═══██╗██╔════╝"
echo " ███████║██║   ██║██╔████╔██║██║██║   ██║███████╗"
echo " ██╔══██║██║   ██║██║╚██╔╝██║██║██║   ██║╚════██║"
echo " ██║  ██║╚██████╔╝██║ ╚═╝ ██║██║╚██████╔╝███████║"
echo " ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚═╝ ╚═════╝ ╚══════╝"
echo -e "${NC}"
echo -e "  ${BOLD}Production Homelab OS Installer${NC} — Ubuntu/Debian"
echo ""

# ── 1. System packages ────────────────────────────────────────
log "Installing system dependencies..."
apt-get update -qq
apt-get install -y \
  curl git nginx samba ntfs-3g exfatprogs \
  util-linux build-essential python3-dev \
  ffmpeg tesseract-ocr tesseract-ocr-eng poppler-utils \
  > /dev/null 2>&1

log "Speed Core media tools installed: ffmpeg, Tesseract OCR, Poppler PDF tools."

# ── 2. Node.js 22 LTS ─────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 22 ]]; then
  log "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null 2>&1
  apt-get install -y nodejs > /dev/null 2>&1
else
  log "Node.js $(node -v) already installed."
fi

# ── 3. App directory & clone/update ──────────────────────────
INSTALL_DIR="/opt/homios"
LEGACY_INSTALL_DIR="/opt/openfinder"
REPO_URL="https://github.com/abdlx/HomiOS.git"
IMMICH_APP_PORT="${IMMICH_APP_PORT:-2283}"
IMMICH_DATA_DIR="${IMMICH_DATA_DIR:-/data/immich}"
IMMICH_VERSION="${IMMICH_VERSION:-v3}"
IMMICH_COMPOSE_URL="${IMMICH_COMPOSE_URL:-https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml}"

# Migrate legacy /opt/openfinder directory if present and /opt/homios does not exist
if [ ! -d "$INSTALL_DIR" ] && [ -d "$LEGACY_INSTALL_DIR" ]; then
  log "Migrating existing installation from $LEGACY_INSTALL_DIR to $INSTALL_DIR..."
  systemctl stop openfinder 2>/dev/null || true
  systemctl disable openfinder --quiet 2>/dev/null || true
  mv "$LEGACY_INSTALL_DIR" "$INSTALL_DIR"
  [ -f "$INSTALL_DIR/data/openfinder.env" ] && [ ! -f "$INSTALL_DIR/data/homios.env" ] && \
    mv "$INSTALL_DIR/data/openfinder.env" "$INSTALL_DIR/data/homios.env"
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  log "Updating existing installation..."
  cd "$INSTALL_DIR"
  git reset --hard HEAD --quiet
  git clean -fd --quiet
  git pull --quiet
else
  log "Cloning HomiOS to $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR" --quiet
  cd "$INSTALL_DIR"
fi

# ── Coolify helper functions ──────────────────────────────────
# These run read-only checks only. No Coolify state is modified here.

# detect_running_coolify: returns 0 if a container named exactly 'coolify' is
# actively running, 1 otherwise. Uses docker inspect for an exact match.
detect_running_coolify() {
  command -v docker >/dev/null 2>&1 || return 1
  [ "$(docker inspect -f '{{.State.Running}}' coolify 2>/dev/null)" = "true" ]
}

# detect_external_coolify_or_fail: called when --existing-coolify is active.
# Requires a live running Coolify container. A stale /data/coolify directory
# does NOT qualify — only a running container confirms Coolify is usable.
# Distinguishes between "stopped" and "never installed" for clear error messages.
detect_external_coolify_or_fail() {
  local has_container=false
  local has_dir=false

  detect_running_coolify && has_container=true || true
  [ -f "${COOLIFY_DATA_DIR}/source/.env" ] && has_dir=true || true

  if [ "$has_container" = "true" ]; then
    log "External Coolify container confirmed running."
    return 0
  fi

  if [ "$has_dir" = "true" ]; then
    fail "Coolify installation detected at $COOLIFY_DATA_DIR, but the Coolify
container is not currently running.
Start Coolify before installing HomiOS in --existing-coolify mode."
  fi

  fail "ERROR: --existing-coolify was specified, but no running Coolify installation
was detected on this host.
HomiOS will not install or modify Coolify in external mode.
If you want HomiOS to install and manage Coolify, use --with-coolify instead."
}

# resolve_managed_coolify_ownership: called when --with-coolify is active.
# install.sh (not the helper scripts) decides whether a fresh install is safe.
# Refuses if an unowned Coolify instance is detected, to prevent accidental
# lifecycle takeover of a production Coolify the user did not install via HomiOS.
resolve_managed_coolify_ownership() {
  # Already confirmed owner from a previous run — continue managing it.
  if [ "$COOLIFY_OWNED_BY_HOMIOS" = "true" ]; then
    log "Confirmed: HomiOS owns this Coolify installation."
    return 0
  fi

  # Detect any existing Coolify (running container or directory evidence).
  local existing=false
  detect_running_coolify && existing=true || true
  [ -f "${COOLIFY_DATA_DIR}/source/.env" ] && existing=true || true

  if [ "$existing" = "true" ]; then
    fail "An existing Coolify installation was detected on this host, but it is
not marked as owned by HomiOS (COOLIFY_OWNED_BY_HOMIOS is not true).

HomiOS refuses to take lifecycle control of a Coolify instance it did not create.

Options:
  --existing-coolify    Integrate with the running Coolify in read-only mode.
  --without-coolify     Skip Coolify integration entirely.

If you previously installed Coolify via HomiOS and lost the env file, you can
force ownership by setting: COOLIFY_OWNED_BY_HOMIOS=true bash install.sh --with-coolify"
  fi

  # Nothing detected — safe to do a fresh installation.
  COOLIFY_OWNED_BY_HOMIOS=true
  log "No existing Coolify detected — proceeding with fresh managed installation."
}

# ── Preserve prior choices when re-running over an existing host ─────────────
PREVIOUS_ENV_FILE="$INSTALL_DIR/data/homios.env"
if [ -f "$PREVIOUS_ENV_FILE" ]; then
  # Read new-style keys first (they take precedence over CLI defaults)
  [ -n "$COOLIFY_MODE" ] || \
    COOLIFY_MODE=$(sed -n 's/^COOLIFY_MODE=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  [ -n "$COOLIFY_OWNED_BY_HOMIOS" ] || \
    COOLIFY_OWNED_BY_HOMIOS=$(sed -n 's/^COOLIFY_OWNED_BY_HOMIOS=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  [ -n "$HOMIOS_PROXY_MODE" ] || \
    HOMIOS_PROXY_MODE=$(sed -n 's/^HOMIOS_PROXY_MODE=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  [ "$CODEX_UI_ENABLED" = "true" ] || \
    CODEX_UI_ENABLED=$(sed -n 's/^CODEX_UI_ENABLED=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  [ -n "$IMMICH_ENABLED" ] || \
    IMMICH_ENABLED=$(sed -n 's/^IMMICH_ENABLED=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)

  # Preserve any explicitly user-configured HOMIOS_PORT from a previous install.
  # If the user set a custom port, we never overwrite it.
  [ -n "$HOMIOS_PORT" ] || \
    HOMIOS_PORT=$(sed -n 's/^HOMIOS_PORT=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)

  # Migration: if no HOMIOS_PORT is stored and the config was written before
  # HOMIOS_CONFIG_VERSION=2 (port 8740), migrate the default 3000 → 8740.
  # Installations that had an explicit custom PORT are not touched here because
  # the user would have set HOMIOS_PORT explicitly.
  _config_version=$(sed -n 's/^HOMIOS_CONFIG_VERSION=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  if [ -z "$HOMIOS_PORT" ] && [ "${_config_version:-1}" -lt 2 ] 2>/dev/null; then
    if [ "$HOMIOS_PROXY_MODE" = "external" ] || [ "$COOLIFY_MODE" = "external" ]; then
      if [ "$MIGRATE_HOMIOS_PORT" = "true" ]; then
        HOMIOS_PORT=8740
        log "Migrating external proxy port: 3000 → 8740 (explicit opt-in)"
      else
        HOMIOS_PORT=3000
        log "External proxy detected. Preserving legacy port 3000."
        log "Run with --migrate-homios-port to explicitly migrate to 8740."
      fi
    else
      HOMIOS_PORT=8740
      log "Migrating default port: 3000 → 8740 (HOMIOS_CONFIG_VERSION 1 → 2)"
    fi
  fi

  # Legacy fallback: if COOLIFY_MODE was not in env file, derive from COOLIFY_ENABLED.
  # Map true → managed/unowned (safest migration — cannot retroactively prove ownership).
  # Map false → disabled/unowned.
  if [ -z "$COOLIFY_MODE" ]; then
    _legacy_enabled=$(sed -n 's/^COOLIFY_ENABLED=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
    if [ "$_legacy_enabled" = "true" ]; then
      COOLIFY_MODE=managed
      COOLIFY_OWNED_BY_HOMIOS=false  # cannot retroactively claim ownership
      warn "Legacy COOLIFY_ENABLED=true found. Mapped to COOLIFY_MODE=managed with
COOLIFY_OWNED_BY_HOMIOS=false (safe default — cannot prove ownership retroactively).
Re-run with --with-coolify if HomiOS installed this Coolify instance."
    else
      COOLIFY_MODE=disabled
      COOLIFY_OWNED_BY_HOMIOS=false
    fi
  fi
fi

# Interactive prompts for optional services (only when not set by CLI or env file)
if [ "$NON_INTERACTIVE" = "false" ] && [ -t 0 ]; then
  if [ -z "$COOLIFY_MODE" ]; then
    echo "Coolify options: (1) managed — HomiOS installs it  (2) external — already running  (3) disabled"
    read -r -p "Coolify mode [1/2/3, default: 3]: " _cm_answer
    case "$_cm_answer" in
      1) COOLIFY_MODE=managed ;;
      2) COOLIFY_MODE=external ; HOMIOS_PROXY_MODE=external ;;
      *) COOLIFY_MODE=disabled ;;
    esac
  fi
  [ -n "$IMMICH_ENABLED" ] || IMMICH_ENABLED=$(ask_optional "Immich")
fi

# Final defaults for anything still unset
COOLIFY_MODE="${COOLIFY_MODE:-disabled}"
COOLIFY_OWNED_BY_HOMIOS="${COOLIFY_OWNED_BY_HOMIOS:-false}"
COOLIFY_INTEGRATION_ENABLED="${COOLIFY_INTEGRATION_ENABLED:-false}"
HOMIOS_PROXY_MODE="${HOMIOS_PROXY_MODE:-nginx}"
CODEX_UI_ENABLED=$(normalize_bool "${CODEX_UI_ENABLED:-false}")
IMMICH_ENABLED=$(normalize_bool "${IMMICH_ENABLED:-false}")
# Default application port is 8740. User-supplied value (CLI or env file) wins.
HOMIOS_PORT="${HOMIOS_PORT:-8740}"

log "Coolify mode: $COOLIFY_MODE (owned=$COOLIFY_OWNED_BY_HOMIOS) | Proxy: $HOMIOS_PROXY_MODE | Codex UI: $CODEX_UI_ENABLED | Immich: $IMMICH_ENABLED"

# ── 4. Install npm dependencies & build ───────────────────────
log "Installing Node.js packages..."
npm install --legacy-peer-deps --silent

log "Verifying Speed Core Node package support..."
node -e "import('sharp').then(() => console.log('sharp ok')).catch((err) => { console.error('sharp failed:', err.message); process.exit(1); })"

log "Building production Next.js bundle..."
npm run build

chmod +x "$INSTALL_DIR/scripts/coolify-up.sh" "$INSTALL_DIR/scripts/coolify-down.sh" \
  "$INSTALL_DIR/scripts/immich-up.sh" "$INSTALL_DIR/scripts/immich-down.sh" 2>/dev/null || true

# ── Coolify dispatch ──────────────────────────────────────────
# The lifecycle invariant enforced here and in the helper scripts:
#   No Coolify install/start/stop/reconfigure unless:
#     COOLIFY_MODE=managed AND COOLIFY_OWNED_BY_HOMIOS=true
#
# --without-coolify (disabled mode) does NOT stop Coolify. Teardown is never
# automatic; it must be an explicit maintenance operation.

case "$COOLIFY_MODE" in
  managed)
    # Ownership conflict detection runs in install.sh (not the helper script).
    # The helper script is a dumb executor; the orchestrator decides freshness.
    resolve_managed_coolify_ownership
    log "Starting bundled Coolify sidecar (HomiOS-managed)..."
    export COOLIFY_MODE COOLIFY_OWNED_BY_HOMIOS
    COOLIFY_APP_PORT="$COOLIFY_APP_PORT" COOLIFY_DATA_DIR="$COOLIFY_DATA_DIR" \
      bash "$INSTALL_DIR/scripts/coolify-up.sh"
    COOLIFY_INTEGRATION_ENABLED=true
    ;;
  external)
    log "External Coolify mode — verifying a running Coolify instance..."
    detect_external_coolify_or_fail
    COOLIFY_OWNED_BY_HOMIOS=false
    COOLIFY_INTEGRATION_ENABLED=true
    warn "External Coolify mode active. HomiOS will NOT manage, restart, update, or reconfigure Coolify."
    ;;
  disabled)
    warn "Coolify integration disabled. HomiOS will not start, stop, or configure Coolify."
    COOLIFY_OWNED_BY_HOMIOS=false
    COOLIFY_INTEGRATION_ENABLED=false
    # Intentionally no coolify-down.sh call here.
    # --without-coolify means "don't integrate", not "shut Coolify down".
    ;;
esac
# ── Port conflict preflight ───────────────────────────────────────────────
# Check if HOMIOS_PORT is already in use before writing the systemd unit.
# Distinguishes HomiOS's own service (safe during update/reinstall) from an
# unrelated process (fail-safe: do not blindly continue).
if ss -ltn 2>/dev/null | grep -q ":${HOMIOS_PORT} "; then
  # Is it our own service already running (upgrade scenario)?
  if systemctl is-active --quiet homios 2>/dev/null; then
    warn "Port ${HOMIOS_PORT} is in use by the existing homios service (normal during reinstall)."
  else
    # Try to identify the occupying process for a helpful error message.
    _port_owner=$(ss -ltnp 2>/dev/null | grep ":${HOMIOS_PORT} " | head -1 || true)
    if [ "$NON_INTERACTIVE" = "true" ]; then
      fail "ERROR: HomiOS port ${HOMIOS_PORT} is already in use by another process.
${_port_owner}
Set HOMIOS_PORT to another available port before installation."
    else
      echo -e "${RED}Port ${HOMIOS_PORT} is already in use.${NC}"
      echo -e "${YELLOW}Process: ${_port_owner:-unknown}${NC}"
      echo -e "${YELLOW}Stop the conflicting service or set a different port:"
      echo -e "  HOMIOS_PORT=<port> bash install.sh${NC}"
      fail "Installation aborted: port conflict on ${HOMIOS_PORT}."
    fi
  fi
fi

if [ "$IMMICH_ENABLED" = "true" ]; then
  log "Starting optional Immich service..."
  IMMICH_APP_PORT="$IMMICH_APP_PORT" IMMICH_DATA_DIR="$IMMICH_DATA_DIR" \
    IMMICH_VERSION="$IMMICH_VERSION" IMMICH_COMPOSE_URL="$IMMICH_COMPOSE_URL" \
    bash "$INSTALL_DIR/scripts/immich-up.sh"
else
  warn "Immich disabled (IMMICH_ENABLED=false)."
  if [ -f "$IMMICH_DATA_DIR/docker-compose.yml" ]; then
    IMMICH_DATA_DIR="$IMMICH_DATA_DIR" bash "$INSTALL_DIR/scripts/immich-down.sh" || true
  fi
fi

# ── 5. Create data directories ───────────────────────────────
log "Provisioning runtime directories..."
mkdir -p \
  "$INSTALL_DIR/data/.tus_uploads" \
  /mnt/homios-storage   # Default isolated storage for Samba shares

chmod 755 /mnt/homios-storage
chmod -R 700 "$INSTALL_DIR/data"  # Protect the SQLite database from other users

# ── 6. Systemd service ───────────────────────────────────────
log "Creating systemd service (homios.service)..."
# Generate a stable APP_KEY for AES-256-GCM encryption of secrets at rest.
# This key protects SSH private keys, S3 credentials, and env var values.
# Persisted here so it survives data/ wipes — losing it = losing all secrets.
APP_KEY_FILE="$INSTALL_DIR/data/.app_key"
ENV_FILE="$INSTALL_DIR/data/homios.env"
mkdir -p "$INSTALL_DIR/data"
if [ ! -f "$APP_KEY_FILE" ]; then
  APP_KEY=$(openssl rand -hex 32)
  echo -n "$APP_KEY" > "$APP_KEY_FILE"
  chmod 600 "$APP_KEY_FILE"
  log "Generated new APP_KEY and saved to $APP_KEY_FILE"
else
  APP_KEY=$(cat "$APP_KEY_FILE")
  log "Using existing APP_KEY from $APP_KEY_FILE"
fi

# ── Derive COOLIFY_ENABLED (backward compatibility) ──────────
# COOLIFY_ENABLED is kept for any existing app code that reads it, but it
# is now derived — never the source of truth. It is ONLY true when HomiOS
# both manages AND owns this Coolify instance. External mode → false, because
# legacy code seeing COOLIFY_ENABLED=true might attempt lifecycle operations.
if [ "$COOLIFY_MODE" = "managed" ] && [ "$COOLIFY_OWNED_BY_HOMIOS" = "true" ]; then
  COOLIFY_ENABLED=true
else
  COOLIFY_ENABLED=false
fi

# APP_KEY goes in an EnvironmentFile (0600), never in the unit's Environment= lines.
# Unit files are world-readable and `systemctl show homios` prints Environment=
# to any local user — which would hand over the key that decrypts every stored SSH
# private key and S3 credential.
SAMBA_ALLOWED_ROOTS=""
HOMIOS_BIND_HOST=""
if [ -f "$ENV_FILE" ]; then
  SAMBA_ALLOWED_ROOTS=$(sed -n 's/^HOMIOS_SAMBA_ALLOWED_ROOTS=//p' "$ENV_FILE" | tail -n 1)
  HOMIOS_BIND_HOST=$(sed -n 's/^HOMIOS_BIND_HOST=//p' "$ENV_FILE" | tail -n 1)
fi

# Fallback derivation if not explicitly saved
if [ -z "$HOMIOS_BIND_HOST" ]; then
  if [ "$HOMIOS_PROXY_MODE" = "nginx" ]; then
    HOMIOS_BIND_HOST="127.0.0.1"
  else
    HOMIOS_BIND_HOST="0.0.0.0"
  fi
fi

umask 077
cat > "$ENV_FILE" <<EOF
APP_KEY=$APP_KEY
HOMIOS_SAMBA_ALLOWED_ROOTS=$SAMBA_ALLOWED_ROOTS
HOMIOS_PORT=$HOMIOS_PORT
HOMIOS_CONFIG_VERSION=2
COOLIFY_MODE=$COOLIFY_MODE
COOLIFY_OWNED_BY_HOMIOS=$COOLIFY_OWNED_BY_HOMIOS
COOLIFY_INTEGRATION_ENABLED=$COOLIFY_INTEGRATION_ENABLED
COOLIFY_ENABLED=$COOLIFY_ENABLED
COOLIFY_APP_PORT=$COOLIFY_APP_PORT
COOLIFY_DATA_DIR=$COOLIFY_DATA_DIR
HOMIOS_PROXY_MODE=$HOMIOS_PROXY_MODE
CODEX_UI_ENABLED=$CODEX_UI_ENABLED
IMMICH_ENABLED=$IMMICH_ENABLED
IMMICH_APP_PORT=$IMMICH_APP_PORT
IMMICH_DATA_DIR=$IMMICH_DATA_DIR
IMMICH_VERSION=$IMMICH_VERSION
IMMICH_COMPOSE_URL=$IMMICH_COMPOSE_URL
HOMIOS_BIND_HOST=$HOMIOS_BIND_HOST
EOF
chmod 600 "$ENV_FILE"
umask 022

cat > /etc/systemd/system/homios.service <<EOF
[Unit]
Description=HomiOS Homelab OS
Documentation=https://github.com/abdlx/HomiOS
After=network.target

[Service]
Type=simple
# Root is required for: mount syscalls, lsblk, smb.conf regeneration
User=root
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
# HOMIOS_PORT is the canonical application port.
# Both variables are set so any code reading PORT or HOMIOS_PORT gets 8740.
Environment=HOMIOS_PORT=$HOMIOS_PORT
Environment=PORT=$HOMIOS_PORT
Environment=HOST=$HOMIOS_BIND_HOST
Environment=DATABASE_URL=$INSTALL_DIR/data/filemanager.db
Environment=TUS_UPLOAD_DIR=$INSTALL_DIR/data/.tus_uploads
Environment=ROOT_DIR=/
Environment=HOMIOS_SAMBA_ROOT=/mnt/homios-storage
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/npm start
# Auto-restart on crash with 5s delay
Restart=on-failure
RestartSec=5
# Give in-flight uploads and the WAL checkpoint time to drain on stop.
KillSignal=SIGTERM
TimeoutStopSec=20
# Logging to systemd journal
StandardOutput=journal
StandardError=journal
SyslogIdentifier=homios

[Install]
WantedBy=multi-user.target
EOF
chmod 644 /etc/systemd/system/homios.service

systemctl daemon-reload
systemctl enable homios --quiet
systemctl restart homios
log "HomiOS Node.js service started."

# ── 7. Samba — isolated storage only, no root share ──────────
log "Configuring secured Samba share..."
[ -f /etc/samba/smb.conf ] && cp /etc/samba/smb.conf /etc/samba/smb.conf.bak

cat > /etc/samba/smb.conf <<EOF
[global]
   workgroup = WORKGROUP
   server string = HomiOS Storage Hub
   server role = standalone server
   map to guest = bad user
   log file = /var/log/samba/log.%m
   max log size = 500
   logging = file

[HomiOS-Storage]
   comment = HomiOS Managed Storage
   # Only share the isolated storage dir — NOT the root filesystem
   path = /mnt/homios-storage
   browsable = yes
   writable = yes
   guest ok = yes
   read only = no
   create mask = 0664
   directory mask = 0775
   force user = root
EOF

systemctl enable smbd --quiet
systemctl restart smbd
log "Samba configured — sharing /mnt/homios-storage only."

# ── 8. Install & configure code-server ───────────────────────
log "Installing code-server..."
if ! command -v code-server &>/dev/null; then
  curl -fsSL https://code-server.dev/install.sh | sh > /dev/null 2>&1
fi

cat > /etc/systemd/system/code-server.service <<EOF
[Unit]
Description=code-server
After=network.target

[Service]
Type=simple
User=root
Environment=PASSWORD=
ExecStart=/usr/bin/code-server --bind-addr 127.0.0.1:8080 --auth none
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable code-server --quiet
systemctl restart code-server
log "code-server configured on port 8080."

# ── 8.5 Codex Web UI (optional — requires --with-codex-ui) ───
# Codex Web UI is NOT installed by default. Pass --with-codex-ui to enable it.
# Existing Codex UI installations are NOT removed if the flag is absent — this
# only governs new/default installation behavior.
if [ "$CODEX_UI_ENABLED" = "true" ]; then
  log "Installing Codex Web UI..."
  CODEX_WEB_DIR="/opt/codex-web-ui"
  CODEX_WEB_REPO="https://github.com/abdlx/codex-web-ui"

  if [ ! -d "$CODEX_WEB_DIR/.git" ]; then
    git clone --depth 1 "$CODEX_WEB_REPO" "$CODEX_WEB_DIR" > /dev/null 2>&1
  else
    git -C "$CODEX_WEB_DIR" reset --hard HEAD --quiet
    git -C "$CODEX_WEB_DIR" clean -fd --quiet
    git -C "$CODEX_WEB_DIR" pull --quiet
  fi

  cd "$CODEX_WEB_DIR"
  # The upstream CLI hard-binds 0.0.0.0; patch in an env override so the service
  # stays loopback-only behind the HomiOS session proxy.
  if grep -q "server.listen(port, '0.0.0.0')" src/cli/index.ts; then
    sed -i "s/server\.listen(port, '0\.0\.0\.0')/server.listen(port, process.env.CODEXUI_HOST || '0.0.0.0')/" src/cli/index.ts
  elif grep -q "CODEXUI_HOST" src/cli/index.ts; then
    log "codex-web-ui already honors CODEXUI_HOST."
  else
    warn "codex-web-ui bind patch anchor not found — the passwordless app may listen on ALL interfaces."
    warn "Block external access to port 5900 (ufw deny 5900) or update the patch in install.sh."
  fi
  npm install --no-audit --no-fund --silent > /dev/null 2>&1
  # Frontend assets must resolve under the /codex/ subpath (vue-tsc typecheck skipped).
  npx vite build --base=/codex/ > /dev/null 2>&1
  npm run build:cli > /dev/null 2>&1
  cd "$INSTALL_DIR"

  cat > /etc/systemd/system/codex-web.service <<EOF
[Unit]
Description=Codex Web UI (HomiOS internal app)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$CODEX_WEB_DIR
Environment=CODEXUI_HOST=127.0.0.1
ExecStart=/usr/bin/node $CODEX_WEB_DIR/dist-cli/index.js --port 5900 --no-password --no-tunnel --no-open --no-login
Restart=always
# No IPAddressDeny lockdown here: it filters outbound traffic too, and Codex
# must reach the OpenAI API (and npm, to bootstrap the Codex CLI). Loopback-only
# exposure comes from the CODEXUI_HOST bind patch applied above.

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable codex-web --quiet
  systemctl restart codex-web
  log "Codex Web UI configured on 127.0.0.1:5900 → /codex (HomiOS admin session required)."
else
  warn "Codex Web UI installation skipped (pass --with-codex-ui to enable it)."
  warn "Existing Codex Web UI installations are not affected."
fi

# ── 9. Nginx reverse proxy ───────────────────────────────────
# NOTE: This app uses Next.js SSR (getServerSideProps), so we CANNOT
# use 'output: export'. Nginx proxies ALL traffic to the Node.js process.
#
# Host Nginx is ONLY installed/configured when HOMIOS_PROXY_MODE=nginx.
# In external proxy mode (--existing-coolify), an existing Coolify Traefik/Caddy
# instance owns ports 80/443 and we must not interfere with it.
if [ "$HOMIOS_PROXY_MODE" = "nginx" ]; then
  log "Configuring Nginx reverse proxy..."
  # HOMIOS_PORT is shell-substituted here at generation time so the nginx
  # config contains the concrete port value (e.g., 127.0.0.1:8740).
  cat > /etc/nginx/sites-available/homios << NGINXEOF
limit_req_zone \$binary_remote_addr zone=homios_api:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=homios_auth:10m rate=30r/m;
limit_req_zone \$binary_remote_addr zone=homios_upload:10m rate=2r/s;
limit_req_zone \$binary_remote_addr zone=homios_socket:10m rate=30r/m;

server {
    listen 80;
    server_name _;

    client_max_body_size 32m;
    limit_req_status 429;

    location = /api/auth/login {
        limit_req zone=homios_auth burst=10 nodelay;
        proxy_pass http://127.0.0.1:${HOMIOS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/upload {
        limit_req zone=homios_upload burst=20 nodelay;
        client_max_body_size 5g;
        proxy_request_buffering off;
        proxy_pass http://127.0.0.1:${HOMIOS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 36000s;
        proxy_send_timeout 36000s;
        send_timeout 36000s;
    }

    location /socket.io/ {
        limit_req zone=homios_socket burst=20 nodelay;
        proxy_pass http://127.0.0.1:${HOMIOS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /api/ {
        limit_req zone=homios_api burst=60 nodelay;
        proxy_pass http://127.0.0.1:${HOMIOS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # All traffic (SSR pages + API) goes to the Node.js process
    location / {
        proxy_pass http://127.0.0.1:${HOMIOS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        # Extended timeouts for TUS resumable uploads (multi-GB files)
        proxy_read_timeout 36000s;
        proxy_send_timeout 36000s;
        send_timeout 36000s;
    }

    # Internal code-server proxy
    location /code/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINXEOF

  # Disable the default Nginx site and enable ours
  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/homios /etc/nginx/sites-enabled/

  nginx -t && systemctl restart nginx
  log "Nginx configured — proxying port 80 → Node.js :${HOMIOS_PORT}"
else
  warn "Host Nginx configuration skipped (HOMIOS_PROXY_MODE=$HOMIOS_PROXY_MODE)."
  echo ""
  echo -e "  ${YELLOW}ℹ️  HomiOS is running on port ${HOMIOS_PORT}.${NC}"
  echo -e "  ${YELLOW}   Bind address: 0.0.0.0:${HOMIOS_PORT}${NC}"
  echo ""
  echo -e "  ${YELLOW}   Host reverse-proxy configuration was skipped because an external proxy is active.${NC}"
  echo ""
  echo -e "  ${YELLOW}   Architecture:${NC}"
  echo -e "  ${YELLOW}     Internet → Coolify proxy :80/:443 → HomiOS host :${HOMIOS_PORT}${NC}"
  echo -e "  ${YELLOW}     0.0.0.0:${HOMIOS_PORT} is HomiOS's bind address — Coolify is the reverse proxy.${NC}"
  echo ""
  echo -e "  ${YELLOW}   To route through your existing Coolify proxy:${NC}"
  echo -e "  ${YELLOW}   • Do NOT use 'localhost:${HOMIOS_PORT}' — inside a Docker proxy container,${NC}"
  echo -e "  ${YELLOW}     'localhost' refers to that container, not this host.${NC}"
  echo -e "  ${YELLOW}   • Recommended: point Coolify upstream to http://<HOST_LAN_IP>:${HOMIOS_PORT}${NC}"
  echo -e "  ${YELLOW}   • Or configure a Docker host-gateway/shared-network route.${NC}"
  echo ""
fi

# ── 10. Auto-update script ────────────────────────────────────
cat > /usr/local/bin/homios-update <<UPDATEEOF
#!/bin/bash
set -euo pipefail

INSTALL_DIR="$INSTALL_DIR"
ENV_FILE="\$INSTALL_DIR/data/homios.env"

read_setting() {
  local key="\$1"
  local fallback="\$2"
  local value=""
  if [ -f "\$ENV_FILE" ]; then
    value=\$(sed -n "s/^\${key}=//p" "\$ENV_FILE" | tail -n 1)
  fi
  printf '%s' "\${value:-\$fallback}"
}

# Read persisted state (new keys take precedence)
COOLIFY_MODE=\$(read_setting COOLIFY_MODE "disabled")
COOLIFY_OWNED_BY_HOMIOS=\$(read_setting COOLIFY_OWNED_BY_HOMIOS "false")
COOLIFY_INTEGRATION_ENABLED=\$(read_setting COOLIFY_INTEGRATION_ENABLED "false")
COOLIFY_APP_PORT=\$(read_setting COOLIFY_APP_PORT "$COOLIFY_APP_PORT")
COOLIFY_DATA_DIR=\$(read_setting COOLIFY_DATA_DIR "$COOLIFY_DATA_DIR")
HOMIOS_PROXY_MODE=\$(read_setting HOMIOS_PROXY_MODE "nginx")
CODEX_UI_ENABLED=\$(read_setting CODEX_UI_ENABLED "false")
IMMICH_ENABLED=\$(read_setting IMMICH_ENABLED "false")
IMMICH_APP_PORT=\$(read_setting IMMICH_APP_PORT "$IMMICH_APP_PORT")
IMMICH_DATA_DIR=\$(read_setting IMMICH_DATA_DIR "$IMMICH_DATA_DIR")
IMMICH_VERSION=\$(read_setting IMMICH_VERSION "$IMMICH_VERSION")
IMMICH_COMPOSE_URL=\$(read_setting IMMICH_COMPOSE_URL "$IMMICH_COMPOSE_URL")
HOMIOS_BIND_HOST=\$(read_setting HOMIOS_BIND_HOST "")

# Preserve user-configured HOMIOS_PORT; migrate old default 3000 →  8740 if needed.
HOMIOS_PORT=\$(read_setting HOMIOS_PORT "")
_cfg_ver=\$(read_setting HOMIOS_CONFIG_VERSION "1")
if [ -z "\$HOMIOS_PORT" ]; then
  if [ "\${_cfg_ver:-1}" -lt 2 ] 2>/dev/null; then
    if [ "\$HOMIOS_PROXY_MODE" = "external" ] || [ "\$COOLIFY_MODE" = "external" ]; then
      if [ "\$MIGRATE_HOMIOS_PORT" = "true" ]; then
        HOMIOS_PORT=8740
        echo "[update] Migrating external proxy port: 3000 → 8740 (explicit opt-in)"
      else
        HOMIOS_PORT=3000
        echo "[update] External proxy detected. Preserving legacy port 3000."
        echo "[update] Run update with --migrate-homios-port to explicitly migrate to 8740."
      fi
    else
      HOMIOS_PORT=8740
      echo "[update] Migrating default port: 3000 → 8740 (HOMIOS_CONFIG_VERSION 1 → 2)"
    fi
  else
    HOMIOS_PORT=8740
  fi
fi

# Fallback derivation if not explicitly saved
if [ -z "\$HOMIOS_BIND_HOST" ]; then
  if [ "\$HOMIOS_PROXY_MODE" = "nginx" ]; then
    HOMIOS_BIND_HOST="127.0.0.1"
  else
    HOMIOS_BIND_HOST="0.0.0.0"
  fi
fi

# Legacy fallback for installs that only have COOLIFY_ENABLED
if [ "\$COOLIFY_MODE" = "disabled" ]; then
  _legacy=\$(read_setting COOLIFY_ENABLED "")
  if [ "\$_legacy" = "true" ]; then
    COOLIFY_MODE=managed
    COOLIFY_OWNED_BY_HOMIOS=false
  fi
fi

_FLAG_WITH_COOLIFY=false
_FLAG_EXISTING_COOLIFY=false
_FLAG_WITHOUT_COOLIFY=false
MIGRATE_HOMIOS_PORT=false

while [ "\$#" -gt 0 ]; do
  case "\$1" in
    --with-coolify)
      COOLIFY_MODE=managed
      _FLAG_WITH_COOLIFY=true
      ;;
    --existing-coolify)
      COOLIFY_MODE=external
      HOMIOS_PROXY_MODE=external
      _FLAG_EXISTING_COOLIFY=true
      ;;
    --without-coolify)
      COOLIFY_MODE=disabled
      _FLAG_WITHOUT_COOLIFY=true
      ;;
    --with-immich)    IMMICH_ENABLED=true ;;
    --without-immich) IMMICH_ENABLED=false ;;
    --with-codex-ui)  CODEX_UI_ENABLED=true ;;
    --migrate-homios-port) MIGRATE_HOMIOS_PORT=true ;;
    -h|--help)
      echo "Usage: sudo homios-update [--with-coolify|--existing-coolify|--without-coolify]"
      echo "                              [--with-immich|--without-immich] [--with-codex-ui]"
      exit 0
      ;;
    *) echo "Unknown option: \$1" >&2; exit 2 ;;
  esac
  shift
done

if [ "\$_FLAG_WITH_COOLIFY" = "true" ] && [ "\$_FLAG_EXISTING_COOLIFY" = "true" ]; then
  echo "ERROR: --with-coolify and --existing-coolify are mutually exclusive." >&2; exit 2
fi
if [ "\$_FLAG_WITHOUT_COOLIFY" = "true" ] && [ "\$_FLAG_EXISTING_COOLIFY" = "true" ]; then
  echo "ERROR: --without-coolify and --existing-coolify are mutually exclusive." >&2; exit 2
fi
if [ "\$_FLAG_WITH_COOLIFY" = "true" ] && [ "\$_FLAG_WITHOUT_COOLIFY" = "true" ]; then
  echo "ERROR: --with-coolify and --without-coolify are mutually exclusive." >&2; exit 2
fi

detect_running_coolify() {
  command -v docker >/dev/null 2>&1 || return 1
  [ "\$(docker inspect -f '{{.State.Running}}' coolify 2>/dev/null)" = "true" ]
}

cd "\$INSTALL_DIR"
git reset --hard HEAD --quiet
git clean -fd --quiet
git pull
apt-get update -qq
apt-get install -y ffmpeg tesseract-ocr tesseract-ocr-eng poppler-utils > /dev/null 2>&1
npm install --legacy-peer-deps --silent
node -e "import('sharp').catch((err) => { console.error('sharp failed:', err.message); process.exit(1); })"
npm run build

chmod +x "\$INSTALL_DIR/scripts/coolify-up.sh" "\$INSTALL_DIR/scripts/coolify-down.sh" \
  "\$INSTALL_DIR/scripts/immich-up.sh" "\$INSTALL_DIR/scripts/immich-down.sh" 2>/dev/null || true

# ── Coolify dispatch (update) ──────────────────────────────────
# Lifecycle invariant: no Coolify up/down unless MODE=managed AND OWNED=true.
# --without-coolify does NOT stop Coolify.
case "\$COOLIFY_MODE" in
  managed)
    if [ "\$COOLIFY_OWNED_BY_HOMIOS" = "true" ]; then
      echo "[update] Updating managed Coolify sidecar..."
      export COOLIFY_MODE COOLIFY_OWNED_BY_HOMIOS
      COOLIFY_APP_PORT="\$COOLIFY_APP_PORT" COOLIFY_DATA_DIR="\$COOLIFY_DATA_DIR" \
        bash "\$INSTALL_DIR/scripts/coolify-up.sh"
      COOLIFY_INTEGRATION_ENABLED=true
    else
      echo "[update] WARNING: COOLIFY_MODE=managed but COOLIFY_OWNED_BY_HOMIOS is not true." >&2
      echo "[update] Skipping Coolify lifecycle. Re-run install.sh --with-coolify to take ownership." >&2
      COOLIFY_INTEGRATION_ENABLED=false
    fi
    ;;
  external)
    if detect_running_coolify; then
      echo "[update] External Coolify confirmed running. HomiOS will not modify it."
      COOLIFY_INTEGRATION_ENABLED=true
    else
      echo "[update] WARNING: COOLIFY_MODE=external but Coolify container is not running." >&2
      COOLIFY_INTEGRATION_ENABLED=false
    fi
    ;;
  disabled)
    echo "[update] Coolify integration disabled — no Coolify lifecycle operations."
    COOLIFY_INTEGRATION_ENABLED=false
    # Intentionally no coolify-down.sh call.
    ;;
esac

if [ "\$IMMICH_ENABLED" = "true" ]; then
  IMMICH_APP_PORT="\$IMMICH_APP_PORT" IMMICH_DATA_DIR="\$IMMICH_DATA_DIR" \
    IMMICH_VERSION="\$IMMICH_VERSION" IMMICH_COMPOSE_URL="\$IMMICH_COMPOSE_URL" \
    bash "\$INSTALL_DIR/scripts/immich-up.sh"
elif [ -f "\$IMMICH_DATA_DIR/docker-compose.yml" ]; then
  IMMICH_DATA_DIR="\$IMMICH_DATA_DIR" bash "\$INSTALL_DIR/scripts/immich-down.sh" || true
fi

if command -v code-server &>/dev/null; then
  curl -fsSL https://code-server.dev/install.sh | sh > /dev/null 2>&1
  systemctl restart code-server
fi

# ── Codex Web UI update (only if enabled) ─────────────────────
# Existing Codex UI installations are NOT removed when CODEX_UI_ENABLED=false.
if [ "\$CODEX_UI_ENABLED" = "true" ]; then
  CODEX_WEB_DIR="/opt/codex-web-ui"
  CODEX_WEB_REPO="https://github.com/abdlx/codex-web-ui"
  if [ ! -d "\$CODEX_WEB_DIR/.git" ]; then
    git clone --depth 1 "\$CODEX_WEB_REPO" "\$CODEX_WEB_DIR"
  fi
  cd "\$CODEX_WEB_DIR"
  git reset --hard HEAD --quiet
  git clean -fd --quiet
  git pull
  if grep -q "server.listen(port, '0.0.0.0')" src/cli/index.ts; then
    sed -i "s/server\.listen(port, '0\.0\.0\.0')/server.listen(port, process.env.CODEXUI_HOST || '0.0.0.0')/" src/cli/index.ts
  elif ! grep -q "CODEXUI_HOST" src/cli/index.ts; then
    echo "WARNING: codex-web-ui bind patch anchor not found — port 5900 may listen on all interfaces."
  fi
  npm install --no-audit --no-fund --silent
  npx vite build --base=/codex/
  npm run build:cli
  cd "\$INSTALL_DIR"

  if [ ! -f /etc/systemd/system/codex-web.service ]; then
    cat > /etc/systemd/system/codex-web.service <<'CODEXUNIT'
[Unit]
Description=Codex Web UI (HomiOS internal app)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/codex-web-ui
Environment=CODEXUI_HOST=127.0.0.1
ExecStart=/usr/bin/node /opt/codex-web-ui/dist-cli/index.js --port 5900 --no-password --no-tunnel --no-open --no-login
Restart=always

[Install]
WantedBy=multi-user.target
CODEXUNIT
    systemctl daemon-reload
    systemctl enable codex-web --quiet
  fi
  systemctl restart codex-web
fi

# Re-sync APP_KEY from the persisted key file into the 0600 EnvironmentFile.
# It must never be written into the unit itself — unit files are world-readable
# and `systemctl show` exposes Environment= to any local user.
APP_KEY_FILE="$INSTALL_DIR/data/.app_key"
ENV_FILE="$INSTALL_DIR/data/homios.env"
if [ -f "\$APP_KEY_FILE" ]; then
  CURRENT_KEY=\$(cat "\$APP_KEY_FILE")
  CURRENT_SAMBA_ALLOWED_ROOTS=""
  if [ -f "\$ENV_FILE" ]; then
    CURRENT_SAMBA_ALLOWED_ROOTS=\$(sed -n 's/^HOMIOS_SAMBA_ALLOWED_ROOTS=//p' "\$ENV_FILE" | tail -n 1)
  fi

  # Derive COOLIFY_ENABLED for backward compat
  if [ "\$COOLIFY_MODE" = "managed" ] && [ "\$COOLIFY_OWNED_BY_HOMIOS" = "true" ]; then
    COOLIFY_ENABLED_DERIVED=true
  else
    COOLIFY_ENABLED_DERIVED=false
  fi

  umask 077
  printf 'APP_KEY=%s\nHOMIOS_SAMBA_ALLOWED_ROOTS=%s\nCOOLIFY_MODE=%s\nCOOLIFY_OWNED_BY_HOMIOS=%s\nCOOLIFY_INTEGRATION_ENABLED=%s\nCOOLIFY_ENABLED=%s\nCOOLIFY_APP_PORT=%s\nCOOLIFY_DATA_DIR=%s\nHOMIOS_PROXY_MODE=%s\nCODEX_UI_ENABLED=%s\nIMMICH_ENABLED=%s\nIMMICH_APP_PORT=%s\nIMMICH_DATA_DIR=%s\nIMMICH_VERSION=%s\nIMMICH_COMPOSE_URL=%s\nHOMIOS_BIND_HOST=%s\n' \
    "\$CURRENT_KEY" "\$CURRENT_SAMBA_ALLOWED_ROOTS" \
    "\$COOLIFY_MODE" "\$COOLIFY_OWNED_BY_HOMIOS" "\$COOLIFY_INTEGRATION_ENABLED" "\$COOLIFY_ENABLED_DERIVED" \
    "\$COOLIFY_APP_PORT" "\$COOLIFY_DATA_DIR" "\$HOMIOS_PROXY_MODE" "\$CODEX_UI_ENABLED" \
    "\$IMMICH_ENABLED" "\$IMMICH_APP_PORT" "\$IMMICH_DATA_DIR" "\$IMMICH_VERSION" "\$IMMICH_COMPOSE_URL" "\$HOMIOS_BIND_HOST" \
    > "\$ENV_FILE"
  chmod 600 "\$ENV_FILE"
  umask 022
  # Inject port settings that the printf above doesn't include yet
  # (avoids rewriting the printf format string inside a heredoc-within-heredoc).
  grep -q '^HOMIOS_PORT=' "\$ENV_FILE" || printf 'HOMIOS_PORT=%s\n' "\$HOMIOS_PORT" >> "\$ENV_FILE"
  grep -q '^HOMIOS_CONFIG_VERSION=' "\$ENV_FILE" || printf 'HOMIOS_CONFIG_VERSION=2\n' >> "\$ENV_FILE"
  sed -i "s|^HOMIOS_PORT=.*|HOMIOS_PORT=\${HOMIOS_PORT}|" "\$ENV_FILE"
  sed -i "s|^HOMIOS_CONFIG_VERSION=.*|HOMIOS_CONFIG_VERSION=2|" "\$ENV_FILE"
  chmod 600 "\$ENV_FILE"
  # Scrub any APP_KEY left in the unit by a pre-hardening install.
  sed -i '/^Environment=APP_KEY=/d' /etc/systemd/system/homios.service
  # Patch port lines in the live unit (handles pre-8740 installs that had PORT=3000).
  if grep -q '^Environment=PORT=' /etc/systemd/system/homios.service; then
    sed -i "s|^Environment=PORT=.*|Environment=PORT=\${HOMIOS_PORT}|" /etc/systemd/system/homios.service
  fi
  if grep -q '^Environment=HOMIOS_PORT=' /etc/systemd/system/homios.service; then
    sed -i "s|^Environment=HOMIOS_PORT=.*|Environment=HOMIOS_PORT=\${HOMIOS_PORT}|" /etc/systemd/system/homios.service
  else
    sed -i "/^Environment=PORT=/a Environment=HOMIOS_PORT=\${HOMIOS_PORT}" /etc/systemd/system/homios.service
  fi
  grep -q '^EnvironmentFile=' /etc/systemd/system/homios.service || \
    sed -i "/^Environment=ROOT_DIR=/a EnvironmentFile=\$ENV_FILE" /etc/systemd/system/homios.service
  systemctl daemon-reload
fi

# Stop and disable old openfinder service if it was running
if systemctl is-active --quiet openfinder 2>/dev/null; then
  systemctl stop openfinder 2>/dev/null || true
  systemctl disable openfinder --quiet 2>/dev/null || true
  rm -f /etc/systemd/system/openfinder.service
  systemctl daemon-reload
fi

systemctl enable homios --quiet 2>/dev/null || true
systemctl restart homios
echo "HomiOS updated successfully."
UPDATEEOF
chmod +x /usr/local/bin/homios-update
ln -sf /usr/local/bin/homios-update /usr/local/bin/openfinder-update

# ── Done ──────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   HomiOS installed successfully! 🎉      ║${NC}"
echo -e "${GREEN}${BOLD}╠══════════════════════════════════════════════╣${NC}"
if [ "$HOMIOS_PROXY_MODE" = "nginx" ]; then
  echo -e "${GREEN}${BOLD}║${NC}  Dashboard:   ${BOLD}http://$LOCAL_IP${NC}"
  echo -e "${GREEN}${BOLD}║${NC}  HomiOS port: ${BOLD}127.0.0.1:${HOMIOS_PORT}${NC} (via Nginx)"
else
  echo -e "${GREEN}${BOLD}║${NC}  Dashboard:   ${BOLD}http://$LOCAL_IP:${HOMIOS_PORT}${NC}"
  echo -e "${GREEN}${BOLD}║${NC}  Bind:        ${BOLD}0.0.0.0:${HOMIOS_PORT}${NC} (HomiOS bind address)"
fi
if [ "$COOLIFY_MODE" = "managed" ] && [ "$COOLIFY_OWNED_BY_HOMIOS" = "true" ]; then
  echo -e "${GREEN}${BOLD}║${NC}  Coolify:    ${BOLD}http://$LOCAL_IP:$COOLIFY_APP_PORT${NC}"
elif [ "$COOLIFY_MODE" = "external" ]; then
  echo -e "${GREEN}${BOLD}║${NC}  Coolify:    (external — route HomiOS through your existing proxy)"
fi
if [ "$IMMICH_ENABLED" = "true" ]; then
  echo -e "${GREEN}${BOLD}║${NC}  Immich:     ${BOLD}http://$LOCAL_IP:$IMMICH_APP_PORT${NC}"
fi
echo -e "${GREEN}${BOLD}║${NC}  VS Code:     ${BOLD}http://$LOCAL_IP/code/${NC}"
if [ "$CODEX_UI_ENABLED" = "true" ]; then
  echo -e "${GREEN}${BOLD}║${NC}  Codex:      ${BOLD}http://$LOCAL_IP/codex/${NC}"
fi
echo -e "${GREEN}${BOLD}║${NC}  Samba share: ${BOLD}\\\\\\\\$LOCAL_IP\\\\HomiOS-Storage${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Logs:        ${BOLD}journalctl -u homios -f${NC}"
echo -e "${GREEN}${BOLD}║${NC}  Update:      ${BOLD}sudo homios-update${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}First boot: Open the dashboard URL to create your admin account.${NC}"
echo -e "  ${YELLOW}Coolify:  --with-coolify (managed) | --existing-coolify (external) | --without-coolify (disabled)${NC}"
echo -e "  ${YELLOW}Codex UI: add --with-codex-ui to enable the optional Codex Web UI sidecar.${NC}"
echo ""
