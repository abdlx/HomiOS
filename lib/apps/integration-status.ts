import { getCoolifyIntegration, getCoolifyProvider } from './integration-storage.ts';
import type { AppStoreState, ProviderConnectionStatus } from './types.ts';
import { isSupportedCoolifyVersion } from './providers/coolify-version.ts';

let cache: { at: number; value: ReturnType<typeof build> } | null = null;
const TTL = 20_000;

function build(integration: ReturnType<typeof getCoolifyIntegration>, health: ProviderConnectionStatus | null) {
  const configuredMode = integration?.mode || (['managed', 'external'].includes(String(process.env.COOLIFY_MODE)) ? process.env.COOLIFY_MODE as 'managed' | 'external' : 'disabled');
  let appStoreState: AppStoreState = 'needs_coolify';
  if (configuredMode !== 'disabled') appStoreState = integration?.connected ? 'coolify_offline' : 'needs_connection';
  if (health?.authenticated && health.reachable) appStoreState = isSupportedCoolifyVersion(integration?.coolifyVersion) ? 'available' : 'unsupported';
  return {
    mode: configuredMode,
    installationOwnedByHomiOS: integration?.installationOwnedByHomiOS || false,
    connected: integration?.connected || false,
    reachable: health?.reachable || false,
    authenticated: health?.authenticated || false,
    reason: health?.reason,
    appStoreState,
    baseUrl: integration?.baseUrl || null,
    serverUuid: integration?.serverUuid || null,
    destinationUuid: integration?.destinationUuid || null,
    projectUuid: integration?.projectUuid || null,
    environmentUuid: integration?.environmentUuid || null,
    projectName: integration?.projectName || 'HomiOS-Apps',
    storageAware: integration?.storageAware ?? false,
    coolifyVersion: integration?.coolifyVersion,
    lastValidatedAt: integration?.lastValidatedAt || null,
  };
}

export async function getCoolifyIntegrationStatus(force = false) {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.value;
  const integration = getCoolifyIntegration();
  let health: ProviderConnectionStatus | null = null;
  if (integration?.connected) {
    try { health = await getCoolifyProvider().getConnectionStatus(); }
    catch { health = { connected: false, reachable: false, authenticated: false, reason: 'not_configured' }; }
  }
  const value = build(integration, health);
  cache = { at: Date.now(), value };
  return value;
}

export function clearIntegrationStatusCache() { cache = null; }
