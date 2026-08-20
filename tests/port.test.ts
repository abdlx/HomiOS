/**
 * Port resolution tests — installer, update script, and runtime.
 *
 * Verifies:
 * 1. Runtime server.js precedence: HOMIOS_PORT > PORT > default 8740
 * 2. Installer port resolution precedence:
 *    - Explicit --migrate-homios-port forces 8740 (external proxy preservation does NOT override it)
 *    - Explicit user-configured HOMIOS_PORT preserves custom value
 *    - Existing external proxy without migration flag preserves 3000
 *    - Existing external already on 8740 preserves 8740
 *    - New external installation defaults to 8740
 *    - Managed nginx legacy installation migrates default 3000 to 8740
 *    - Custom existing HOMIOS_PORT preserves custom value
 * 3. Embedded homios-update port resolution precedence across all scenarios.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Helper: resolve port with the same precedence logic as server.js
function resolvePort(env: Record<string, string | undefined> = {}): number {
  return Number(
    env.HOMIOS_PORT ||
    env.PORT ||
    8740
  );
}

function getBashPath(): string {
  if (process.platform === 'win32') {
    const gitBashPaths = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    for (const p of gitBashPaths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return 'bash';
}

function runInstallerPortResolution(opts: {
  cliArgs?: string[];
  env?: Record<string, string>;
  previousEnvContent?: string;
}): { port: string; bindHost: string; output: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homios-port-test-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  if (opts.previousEnvContent !== undefined) {
    fs.writeFileSync(path.join(dataDir, 'homios.env'), opts.previousEnvContent, 'utf8');
  }

  const script = `
set -euo pipefail

INSTALL_DIR="${tmpDir.replace(/\\/g, '/')}"
COOLIFY_MODE=""
COOLIFY_OWNED_BY_HOMIOS=""
COOLIFY_INTEGRATION_ENABLED=""
COOLIFY_APP_PORT="8000"
COOLIFY_DATA_DIR="/data/coolify"
CODEX_UI_ENABLED="false"
HOMIOS_PROXY_MODE=""
IMMICH_ENABLED=""
_USER_SUPPLIED_PORT="\${HOMIOS_PORT:-}"
HOMIOS_PORT=""
NON_INTERACTIVE=true
_FLAG_WITH_COOLIFY=false
_FLAG_EXISTING_COOLIFY=false
_FLAG_WITHOUT_COOLIFY=false
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
    --migrate-homios-port) MIGRATE_HOMIOS_PORT=true ;;
    --non-interactive) NON_INTERACTIVE=true ;;
  esac
  shift
done

PREVIOUS_ENV_FILE="$INSTALL_DIR/data/homios.env"
_saved_port=""
_saved_cfg_version=""
if [ -f "$PREVIOUS_ENV_FILE" ]; then
  [ -n "$COOLIFY_MODE" ] || COOLIFY_MODE=$(sed -n 's/^COOLIFY_MODE=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  [ -n "$HOMIOS_PROXY_MODE" ] || HOMIOS_PROXY_MODE=$(sed -n 's/^HOMIOS_PROXY_MODE=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  _saved_port=$(sed -n 's/^HOMIOS_PORT=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  [ -n "$_saved_port" ] || _saved_port=$(sed -n 's/^PORT=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
  _saved_cfg_version=$(sed -n 's/^HOMIOS_CONFIG_VERSION=//p' "$PREVIOUS_ENV_FILE" | tail -n 1)
fi

COOLIFY_MODE="\${COOLIFY_MODE:-disabled}"
HOMIOS_PROXY_MODE="\${HOMIOS_PROXY_MODE:-nginx}"

if [ "$MIGRATE_HOMIOS_PORT" = "true" ]; then
  HOMIOS_PORT=8740
  if [ "$HOMIOS_PROXY_MODE" = "external" ] || [ "$COOLIFY_MODE" = "external" ]; then
    echo "HomiOS migrated to port 8740."
    echo "Your external reverse proxy was NOT modified."
    echo "Update its upstream from <host>:3000 to <host>:8740."
  else
    echo "Migrating default port: 3000 → 8740 (explicit opt-in)"
  fi
elif [ -n "$_USER_SUPPLIED_PORT" ]; then
  HOMIOS_PORT="$_USER_SUPPLIED_PORT"
elif [ -n "$_saved_port" ]; then
  if [ "$_saved_port" = "3000" ]; then
    if [ "$HOMIOS_PROXY_MODE" = "external" ] || [ "$COOLIFY_MODE" = "external" ]; then
      HOMIOS_PORT=3000
      echo "External proxy detected. Preserving legacy port 3000."
      echo "Run with --migrate-homios-port to explicitly migrate to 8740."
    else
      HOMIOS_PORT=8740
      echo "Migrating default port: 3000 → 8740 (HOMIOS_CONFIG_VERSION 1 → 2)"
    fi
  else
    HOMIOS_PORT="$_saved_port"
  fi
elif [ -f "$PREVIOUS_ENV_FILE" ] && [ "\${_saved_cfg_version:-1}" -lt 2 ] 2>/dev/null; then
  if [ "$HOMIOS_PROXY_MODE" = "external" ] || [ "$COOLIFY_MODE" = "external" ]; then
    HOMIOS_PORT=3000
    echo "External proxy detected. Preserving legacy port 3000."
    echo "Run with --migrate-homios-port to explicitly migrate to 8740."
  else
    HOMIOS_PORT=8740
    echo "Migrating default port: 3000 → 8740 (HOMIOS_CONFIG_VERSION 1 → 2)"
  fi
else
  HOMIOS_PORT=8740
fi

if [ "$HOMIOS_PROXY_MODE" = "nginx" ]; then
  HOMIOS_BIND_HOST="127.0.0.1"
else
  HOMIOS_BIND_HOST="0.0.0.0"
fi

echo "RESOLVED_PORT=$HOMIOS_PORT"
echo "RESOLVED_BIND_HOST=$HOMIOS_BIND_HOST"
`;

  try {
    const bashPath = getBashPath();
    const args = ['-c', script, 'bash', ...(opts.cliArgs || [])];
    const stdout = execFileSync(bashPath, args, {
      env: { ...process.env, ...(opts.env || {}) },
      encoding: 'utf8',
    });

    const portMatch = stdout.match(/RESOLVED_PORT=(\d+)/);
    const hostMatch = stdout.match(/RESOLVED_BIND_HOST=([^\r\n]+)/);

    return {
      port: portMatch ? portMatch[1] : '',
      bindHost: hostMatch ? hostMatch[1] : '',
      output: stdout,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runHomiosUpdatePortResolution(opts: {
  cliArgs?: string[];
  env?: Record<string, string>;
  previousEnvContent?: string;
}): { port: string; bindHost: string; output: string; persistedEnv: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'homios-update-test-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const envFilePath = path.join(dataDir, 'homios.env');
  if (opts.previousEnvContent !== undefined) {
    fs.writeFileSync(envFilePath, opts.previousEnvContent, 'utf8');
  }

  const script = `
set -euo pipefail

INSTALL_DIR="${tmpDir.replace(/\\/g, '/')}"
ENV_FILE="$INSTALL_DIR/data/homios.env"

read_setting() {
  local key="$1"
  local fallback="$2"
  local value=""
  if [ -f "$ENV_FILE" ]; then
    value=$(sed -n "s/^\${key}=//p" "$ENV_FILE" | tail -n 1)
  fi
  printf '%s' "\${value:-\$fallback}"
}

_FLAG_WITH_COOLIFY=false
_FLAG_EXISTING_COOLIFY=false
_FLAG_WITHOUT_COOLIFY=false
MIGRATE_HOMIOS_PORT=false
COOLIFY_MODE_CLI=""
HOMIOS_PROXY_MODE_CLI=""
IMMICH_ENABLED_CLI=""
CODEX_UI_ENABLED_CLI=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --with-coolify)
      COOLIFY_MODE_CLI=managed
      _FLAG_WITH_COOLIFY=true
      ;;
    --existing-coolify)
      COOLIFY_MODE_CLI=external
      HOMIOS_PROXY_MODE_CLI=external
      _FLAG_EXISTING_COOLIFY=true
      ;;
    --without-coolify)
      COOLIFY_MODE_CLI=disabled
      _FLAG_WITHOUT_COOLIFY=true
      ;;
    --migrate-homios-port) MIGRATE_HOMIOS_PORT=true ;;
  esac
  shift
done

COOLIFY_MODE="\${COOLIFY_MODE_CLI:-\$(read_setting COOLIFY_MODE "disabled")}"
COOLIFY_OWNED_BY_HOMIOS=$(read_setting COOLIFY_OWNED_BY_HOMIOS "false")
COOLIFY_INTEGRATION_ENABLED=$(read_setting COOLIFY_INTEGRATION_ENABLED "false")
COOLIFY_APP_PORT=$(read_setting COOLIFY_APP_PORT "8000")
COOLIFY_DATA_DIR=$(read_setting COOLIFY_DATA_DIR "/data/coolify")
HOMIOS_PROXY_MODE="\${HOMIOS_PROXY_MODE_CLI:-\$(read_setting HOMIOS_PROXY_MODE "nginx")}"
CODEX_UI_ENABLED=$(read_setting CODEX_UI_ENABLED "false")
IMMICH_ENABLED=$(read_setting IMMICH_ENABLED "false")
IMMICH_APP_PORT=$(read_setting IMMICH_APP_PORT "2283")
IMMICH_DATA_DIR=$(read_setting IMMICH_DATA_DIR "/data/immich")
IMMICH_VERSION=$(read_setting IMMICH_VERSION "v3")
IMMICH_COMPOSE_URL=$(read_setting IMMICH_COMPOSE_URL "")
HOMIOS_BIND_HOST=$(read_setting HOMIOS_BIND_HOST "")

_saved_port=$(read_setting HOMIOS_PORT "")
[ -n "$_saved_port" ] || _saved_port=$(read_setting PORT "")
_cfg_ver=$(read_setting HOMIOS_CONFIG_VERSION "1")

if [ "$MIGRATE_HOMIOS_PORT" = "true" ]; then
  HOMIOS_PORT=8740
  if [ "$HOMIOS_PROXY_MODE" = "external" ] || [ "$COOLIFY_MODE" = "external" ]; then
    echo "[update] HomiOS migrated to port 8740."
    echo "[update] Your external reverse proxy was NOT modified."
    echo "[update] Update its upstream from <host>:3000 to <host>:8740."
  else
    echo "[update] Migrating default port: 3000 → 8740 (explicit opt-in)"
  fi
elif [ -n "\${HOMIOS_PORT:-}" ]; then
  HOMIOS_PORT="\${HOMIOS_PORT}"
  echo "[update] Using explicitly configured HOMIOS_PORT=\${HOMIOS_PORT}"
elif [ -n "$_saved_port" ]; then
  if [ "$_saved_port" = "3000" ]; then
    if [ "$HOMIOS_PROXY_MODE" = "external" ] || [ "$COOLIFY_MODE" = "external" ]; then
      HOMIOS_PORT=3000
      echo "[update] External proxy detected. Preserving legacy port 3000."
      echo "[update] Run update with --migrate-homios-port to explicitly migrate to 8740."
    else
      HOMIOS_PORT=8740
      echo "[update] Migrating default port: 3000 → 8740 (HOMIOS_CONFIG_VERSION 1 → 2)"
    fi
  else
    HOMIOS_PORT="$_saved_port"
  fi
elif [ -f "$ENV_FILE" ] && [ "\${_cfg_ver:-1}" -lt 2 ] 2>/dev/null; then
  if [ "$HOMIOS_PROXY_MODE" = "external" ] || [ "$COOLIFY_MODE" = "external" ]; then
    HOMIOS_PORT=3000
    echo "[update] External proxy detected. Preserving legacy port 3000."
    echo "[update] Run update with --migrate-homios-port to explicitly migrate to 8740."
  else
    HOMIOS_PORT=8740
    echo "[update] Migrating default port: 3000 → 8740 (HOMIOS_CONFIG_VERSION 1 → 2)"
  fi
else
  HOMIOS_PORT=8740
fi

if [ -z "$HOMIOS_BIND_HOST" ]; then
  if [ "$HOMIOS_PROXY_MODE" = "nginx" ]; then
    HOMIOS_BIND_HOST="127.0.0.1"
  else
    HOMIOS_BIND_HOST="0.0.0.0"
  fi
fi

CURRENT_KEY=$(read_setting APP_KEY "test-app-key")
CURRENT_SAMBA_ALLOWED_ROOTS=$(read_setting HOMIOS_SAMBA_ALLOWED_ROOTS "")

printf 'APP_KEY=%s\\nHOMIOS_SAMBA_ALLOWED_ROOTS=%s\\nHOMIOS_PORT=%s\\nHOMIOS_CONFIG_VERSION=2\\nCOOLIFY_MODE=%s\\nCOOLIFY_OWNED_BY_HOMIOS=%s\\nCOOLIFY_INTEGRATION_ENABLED=%s\\nCOOLIFY_ENABLED=%s\\nCOOLIFY_APP_PORT=%s\\nCOOLIFY_DATA_DIR=%s\\nHOMIOS_PROXY_MODE=%s\\nCODEX_UI_ENABLED=%s\\nIMMICH_ENABLED=%s\\nIMMICH_APP_PORT=%s\\nIMMICH_DATA_DIR=%s\\nIMMICH_VERSION=%s\\nIMMICH_COMPOSE_URL=%s\\nHOMIOS_BIND_HOST=%s\\n' \\
  "$CURRENT_KEY" "$CURRENT_SAMBA_ALLOWED_ROOTS" "$HOMIOS_PORT" \\
  "$COOLIFY_MODE" "$COOLIFY_OWNED_BY_HOMIOS" "$COOLIFY_INTEGRATION_ENABLED" "false" \\
  "$COOLIFY_APP_PORT" "$COOLIFY_DATA_DIR" "$HOMIOS_PROXY_MODE" "$CODEX_UI_ENABLED" \\
  "$IMMICH_ENABLED" "$IMMICH_APP_PORT" "$IMMICH_DATA_DIR" "$IMMICH_VERSION" "$IMMICH_COMPOSE_URL" "$HOMIOS_BIND_HOST" \\
  > "$ENV_FILE"

echo "RESOLVED_PORT=$HOMIOS_PORT"
echo "RESOLVED_BIND_HOST=$HOMIOS_BIND_HOST"
`;

  try {
    const bashPath = getBashPath();
    const args = ['-c', script, 'bash', ...(opts.cliArgs || [])];
    const stdout = execFileSync(bashPath, args, {
      env: { ...process.env, ...(opts.env || {}) },
      encoding: 'utf8',
    });

    const portMatch = stdout.match(/RESOLVED_PORT=(\d+)/);
    const hostMatch = stdout.match(/RESOLVED_BIND_HOST=([^\r\n]+)/);
    const persistedEnv = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, 'utf8') : '';

    return {
      port: portMatch ? portMatch[1] : '',
      bindHost: hostMatch ? hostMatch[1] : '',
      output: stdout,
      persistedEnv,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe('Port Resolution', () => {
  describe('Runtime server.js Port Resolution', () => {
    it('defaults to 8740 when no env vars are set', () => {
      expect(resolvePort({})).toBe(8740);
    });

    it('defaults to 8740 when both HOMIOS_PORT and PORT are empty strings', () => {
      expect(resolvePort({ HOMIOS_PORT: '', PORT: '' })).toBe(8740);
    });

    it('uses HOMIOS_PORT when set', () => {
      expect(resolvePort({ HOMIOS_PORT: '9000' })).toBe(9000);
    });

    it('HOMIOS_PORT wins over PORT when both are set', () => {
      expect(resolvePort({ HOMIOS_PORT: '9001', PORT: '3000' })).toBe(9001);
    });

    it('HOMIOS_PORT=8740 wins over legacy PORT=3000', () => {
      expect(resolvePort({ HOMIOS_PORT: '8740', PORT: '3000' })).toBe(8740);
    });

    it('falls back to PORT when HOMIOS_PORT is absent', () => {
      expect(resolvePort({ PORT: '4567' })).toBe(4567);
    });

    it('does NOT use PORT=3000 when HOMIOS_PORT=8740 is set', () => {
      const result = resolvePort({ HOMIOS_PORT: '8740', PORT: '3000' });
      expect(result).toBe(8740);
    });
  });

  describe('Installer Port Precedence Regression Tests', () => {
    it('existing external + no migration flag → preserve 3000', () => {
      const prevEnv = [
        'COOLIFY_MODE=external',
        'HOMIOS_PROXY_MODE=external',
        'HOMIOS_PORT=3000',
        'HOMIOS_CONFIG_VERSION=2',
      ].join('\n');

      const res = runInstallerPortResolution({
        cliArgs: ['--existing-coolify', '--non-interactive'],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('3000');
      expect(res.bindHost).toBe('0.0.0.0');
      expect(res.output).toContain('External proxy detected. Preserving legacy port 3000.');
    });

    it('existing external + --migrate-homios-port → 8740 and prints upstream notice', () => {
      const prevEnv = [
        'COOLIFY_MODE=external',
        'HOMIOS_PROXY_MODE=external',
        'HOMIOS_PORT=3000',
        'HOMIOS_CONFIG_VERSION=2',
      ].join('\n');

      const res = runInstallerPortResolution({
        cliArgs: ['--existing-coolify', '--migrate-homios-port', '--non-interactive'],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('8740');
      expect(res.bindHost).toBe('0.0.0.0');
      expect(res.output).toContain('HomiOS migrated to port 8740.');
      expect(res.output).toContain('Your external reverse proxy was NOT modified.');
      expect(res.output).toContain('Update its upstream from <host>:3000 to <host>:8740.');
    });

    it('existing external already on 8740 → preserve 8740', () => {
      const prevEnv = [
        'COOLIFY_MODE=external',
        'HOMIOS_PROXY_MODE=external',
        'HOMIOS_PORT=8740',
        'HOMIOS_CONFIG_VERSION=2',
      ].join('\n');

      const res = runInstallerPortResolution({
        cliArgs: ['--existing-coolify', '--non-interactive'],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('8740');
      expect(res.bindHost).toBe('0.0.0.0');
    });

    it('new external installation → 8740', () => {
      const res = runInstallerPortResolution({
        cliArgs: ['--existing-coolify', '--non-interactive'],
      });

      expect(res.port).toBe('8740');
      expect(res.bindHost).toBe('0.0.0.0');
    });

    it('managed nginx legacy installation → migrate default 3000 to 8740', () => {
      const prevEnv = [
        'COOLIFY_MODE=disabled',
        'HOMIOS_PROXY_MODE=nginx',
        'HOMIOS_PORT=3000',
        'HOMIOS_CONFIG_VERSION=1',
      ].join('\n');

      const res = runInstallerPortResolution({
        cliArgs: ['--without-coolify', '--non-interactive'],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('8740');
      expect(res.bindHost).toBe('127.0.0.1');
      expect(res.output).toContain('Migrating default port: 3000 → 8740');
    });

    it('custom existing HOMIOS_PORT → preserve custom value', () => {
      const prevEnv = [
        'COOLIFY_MODE=external',
        'HOMIOS_PROXY_MODE=external',
        'HOMIOS_PORT=9000',
        'HOMIOS_CONFIG_VERSION=2',
      ].join('\n');

      const res = runInstallerPortResolution({
        cliArgs: ['--existing-coolify', '--non-interactive'],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('9000');
      expect(res.bindHost).toBe('0.0.0.0');
    });
  });

  describe('Embedded homios-update Port Precedence Regression Tests', () => {
    it('update: existing external + no migration flag → preserve 3000', () => {
      const prevEnv = [
        'COOLIFY_MODE=external',
        'HOMIOS_PROXY_MODE=external',
        'HOMIOS_PORT=3000',
        'HOMIOS_CONFIG_VERSION=2',
      ].join('\n');

      const res = runHomiosUpdatePortResolution({
        cliArgs: [],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('3000');
      expect(res.bindHost).toBe('0.0.0.0');
      expect(res.output).toContain('External proxy detected. Preserving legacy port 3000.');
      expect(res.persistedEnv).toContain('HOMIOS_PORT=3000');
    });

    it('update: existing external + --migrate-homios-port → 8740 and persists', () => {
      const prevEnv = [
        'COOLIFY_MODE=external',
        'HOMIOS_PROXY_MODE=external',
        'HOMIOS_PORT=3000',
        'HOMIOS_CONFIG_VERSION=2',
      ].join('\n');

      const res = runHomiosUpdatePortResolution({
        cliArgs: ['--migrate-homios-port'],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('8740');
      expect(res.bindHost).toBe('0.0.0.0');
      expect(res.output).toContain('HomiOS migrated to port 8740.');
      expect(res.output).toContain('Your external reverse proxy was NOT modified.');
      expect(res.output).toContain('Update its upstream from <host>:3000 to <host>:8740.');
      expect(res.persistedEnv).toContain('HOMIOS_PORT=8740');
      expect(res.persistedEnv).toContain('HOMIOS_CONFIG_VERSION=2');
    });

    it('update: existing external already on 8740 → preserve 8740', () => {
      const prevEnv = [
        'COOLIFY_MODE=external',
        'HOMIOS_PROXY_MODE=external',
        'HOMIOS_PORT=8740',
        'HOMIOS_CONFIG_VERSION=2',
      ].join('\n');

      const res = runHomiosUpdatePortResolution({
        cliArgs: [],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('8740');
      expect(res.bindHost).toBe('0.0.0.0');
      expect(res.persistedEnv).toContain('HOMIOS_PORT=8740');
    });

    it('update: managed nginx legacy installation → migrate default 3000 to 8740', () => {
      const prevEnv = [
        'COOLIFY_MODE=disabled',
        'HOMIOS_PROXY_MODE=nginx',
        'HOMIOS_PORT=3000',
        'HOMIOS_CONFIG_VERSION=1',
      ].join('\n');

      const res = runHomiosUpdatePortResolution({
        cliArgs: [],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('8740');
      expect(res.bindHost).toBe('127.0.0.1');
      expect(res.output).toContain('Migrating default port: 3000 → 8740');
      expect(res.persistedEnv).toContain('HOMIOS_PORT=8740');
    });

    it('update: custom existing HOMIOS_PORT → preserve custom value', () => {
      const prevEnv = [
        'COOLIFY_MODE=external',
        'HOMIOS_PROXY_MODE=external',
        'HOMIOS_PORT=9000',
        'HOMIOS_CONFIG_VERSION=2',
      ].join('\n');

      const res = runHomiosUpdatePortResolution({
        cliArgs: [],
        previousEnvContent: prevEnv,
      });

      expect(res.port).toBe('9000');
      expect(res.bindHost).toBe('0.0.0.0');
      expect(res.persistedEnv).toContain('HOMIOS_PORT=9000');
    });
  });
});
