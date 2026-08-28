/**
 * Central Capability Registry for HomiOS.
 *
 * Derives the operational state of both core and optional integrations from
 * authoritative environment configuration and runtime health probes.
 */
import { existsSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { getCoolifyIntegration } from './apps/integration-storage.ts';

const require = createRequire(import.meta.url);

export type CapabilityState =
  | 'available'
  | 'disabled'
  | 'running'
  | 'degraded'
  | 'unavailable';

export interface Capability {
  id: string;
  name: string;
  configured: boolean;
  installed: boolean;
  running: boolean;
  state: CapabilityState;
  url?: string;
  port?: number;
  reason?: string;
  mode?: 'disabled' | 'managed' | 'external';
  connected?: boolean;
  appStoreAvailable?: boolean;
  ownership?: 'homios' | 'external';
}

export interface CapabilitiesResponse {
  storage: Capability;
  samba: Capability;
  backups: Capability;
  terminal: Capability;
  coolify: Capability;
  immich: Capability;
  codex: Capability;
  codeServer: Capability;
}

const asEnabled = (value: string | undefined): boolean =>
  /^(1|true|yes|on)$/i.test(value || '');

const asPort = (value: string | undefined, fallback: number): number => {
  const port = Number(value || fallback);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
};

async function isReachable(url: string, timeoutMs = 2000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

let cachedCapabilities: CapabilitiesResponse | null = null;
let lastCacheTime = 0;
let isProbing = false;
const CACHE_TTL_MS = 15000;

/**
 * Resolve all system capabilities with runtime health checks.
 */
export async function getCapabilities(): Promise<CapabilitiesResponse> {
  const now = Date.now();
  if (cachedCapabilities && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedCapabilities;
  }
  if (cachedCapabilities && isProbing) {
    // Stale-while-revalidate: return stale data immediately while a background probe is running
    return cachedCapabilities;
  }

  isProbing = true;
  try {
  const coolifyPort = asPort(process.env.COOLIFY_APP_PORT, 8000);
  const immichPort = asPort(process.env.IMMICH_APP_PORT, 2283);
  const codexPort = asPort(process.env.CODEX_PORT, 5900);
  const codeServerPort = asPort(process.env.CODE_SERVER_PORT, 8080);

  const coolifyMode = (process.env.COOLIFY_MODE || (asEnabled(process.env.COOLIFY_ENABLED) ? 'managed' : 'disabled')).toLowerCase();
  const coolifyConfigured = coolifyMode !== 'disabled' && asEnabled(process.env.COOLIFY_INTEGRATION_ENABLED !== undefined ? process.env.COOLIFY_INTEGRATION_ENABLED : 'true');
  const coolifyIntegration = getCoolifyIntegration();
  const immichConfigured = asEnabled(process.env.IMMICH_ENABLED);
  const codexConfigured = asEnabled(process.env.CODEX_UI_ENABLED);
  const codeServerConfigured = asEnabled(process.env.CODE_SERVER_ENABLED);

  // Probe services concurrently
  const [coolifyOnline, immichOnline, codexOnline, codeServerOnline] = await Promise.all([
    coolifyConfigured ? isReachable(`http://127.0.0.1:${coolifyPort}/api/health`) : Promise.resolve(false),
    immichConfigured ? isReachable(`http://127.0.0.1:${immichPort}/`) : Promise.resolve(false),
    codexConfigured ? isReachable(`http://127.0.0.1:${codexPort}/`) : Promise.resolve(false),
    codeServerConfigured ? isReachable(`http://127.0.0.1:${codeServerPort}/`) : Promise.resolve(false),
  ]);

  // Terminal check (node-pty availability)
  let terminalInstalled = true;
  try {
    require.resolve('node-pty');
  } catch {
    terminalInstalled = false;
  }

  const response: CapabilitiesResponse = {
    storage: {
      id: 'storage',
      name: 'Storage',
      configured: true,
      installed: true,
      running: true,
      state: 'running',
    },
    samba: {
      id: 'samba',
      name: 'Samba Sharing',
      configured: true,
      installed: true,
      running: true,
      state: 'running',
    },
    backups: {
      id: 'backups',
      name: 'Local Protection & Backups',
      configured: true,
      installed: true,
      running: true,
      state: 'running',
    },
    terminal: {
      id: 'terminal',
      name: 'Terminal',
      configured: true,
      installed: terminalInstalled,
      running: terminalInstalled,
      state: terminalInstalled ? 'running' : 'unavailable',
      reason: terminalInstalled ? undefined : 'node-pty is not installed',
    },
    coolify: {
      id: 'coolify',
      name: 'Coolify',
      configured: coolifyConfigured,
      installed: coolifyConfigured,
      running: coolifyOnline,
      port: coolifyPort,
      url: `/coolify`,
      state: !coolifyConfigured
        ? 'disabled'
        : coolifyOnline
          ? 'running'
          : 'degraded',
      reason: !coolifyConfigured
        ? 'Coolify integration is disabled'
        : coolifyOnline
          ? undefined
          : `Coolify service is not responding on port ${coolifyPort}`,
      mode: (['managed', 'external'].includes(coolifyMode) ? coolifyMode : 'disabled') as 'disabled' | 'managed' | 'external',
      connected: !!coolifyIntegration?.connected,
      appStoreAvailable: !!coolifyIntegration?.connected && coolifyOnline,
      ownership: coolifyIntegration?.installationOwnedByHomiOS || coolifyMode === 'managed' ? 'homios' : 'external',
    },
    immich: {
      id: 'immich',
      name: 'Immich Photos',
      configured: immichConfigured,
      installed: immichConfigured,
      running: immichOnline,
      port: immichPort,
      url: `/immich`,
      state: !immichConfigured
        ? 'disabled'
        : immichOnline
          ? 'running'
          : 'degraded',
      reason: !immichConfigured
        ? 'Immich integration is disabled'
        : immichOnline
          ? undefined
          : `Immich service is not responding on port ${immichPort}`,
    },
    codex: {
      id: 'codex',
      name: 'Codex AI',
      configured: codexConfigured,
      installed: codexConfigured,
      running: codexOnline,
      port: codexPort,
      url: `/codex`,
      state: !codexConfigured
        ? 'disabled'
        : codexOnline
          ? 'running'
          : 'degraded',
      reason: !codexConfigured
        ? 'Codex UI is disabled in environment'
        : codexOnline
          ? undefined
          : `Codex service is not responding on port ${codexPort}`,
    },
    codeServer: {
      id: 'codeServer',
      name: 'VS Code',
      configured: codeServerConfigured,
      installed: codeServerConfigured,
      running: codeServerOnline,
      port: codeServerPort,
      url: `/vscode`,
      state: !codeServerConfigured
        ? 'disabled'
        : codeServerOnline
          ? 'running'
          : 'degraded',
      reason: !codeServerConfigured
        ? 'Code Server is disabled'
        : codeServerOnline
          ? undefined
          : `Code Server is not responding on port ${codeServerPort}`,
    },
    };

    cachedCapabilities = response;
    lastCacheTime = Date.now();
    return response;
  } finally {
    isProbing = false;
  }
}
