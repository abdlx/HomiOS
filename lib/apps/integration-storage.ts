import { randomUUID } from 'crypto';
import { decryptSecret, encryptSecret } from '../crypto.ts';
import { getDb } from '../db.ts';
import type { CoolifyMode } from './types.ts';
import { CoolifyApiError, CoolifyClient, CoolifyProvider, normalizeCoolifyBaseUrl } from './providers/coolify.ts';

export interface CoolifyIntegrationRecord {
  id: string;
  provider: 'coolify';
  mode: CoolifyMode;
  baseUrl: string | null;
  connected: boolean;
  installationOwnedByHomiOS: boolean;
  tokenEncrypted: string | null;
  teamId?: number;
  serverUuid: string | null;
  destinationUuid: string | null;
  projectUuid: string | null;
  environmentUuid: string | null;
  projectName: string;
  lastValidatedAt: string | null;
  coolifyVersion?: string;
  storageAware: boolean;
}

function mapRow(row: any): CoolifyIntegrationRecord | null {
  if (!row) return null;
  const config = JSON.parse(row.config_json || '{}');
  return {
    id: row.id, provider: 'coolify', mode: row.mode, baseUrl: row.base_url,
    tokenEncrypted: row.encrypted_credentials, connected: !!config.connected,
    installationOwnedByHomiOS: !!config.installationOwnedByHomiOS,
    teamId: config.teamId, serverUuid: config.serverUuid || null,
    destinationUuid: config.destinationUuid || null,
    projectUuid: config.projectUuid || null, environmentUuid: config.environmentUuid || null,
    projectName: 'HomiOS-Apps', lastValidatedAt: config.lastValidatedAt || null,
    coolifyVersion: config.coolifyVersion, storageAware: config.storageAware !== false,
  };
}

export function getCoolifyIntegration() {
  return mapRow(getDb().prepare("SELECT * FROM integrations WHERE provider = 'coolify'").get());
}

export function saveCoolifyIntegration(input: Omit<CoolifyIntegrationRecord, 'id' | 'provider' | 'projectName'> & { token?: string }) {
  const existing = getDb().prepare("SELECT id, encrypted_credentials FROM integrations WHERE provider = 'coolify'").get() as any;
  const id = existing?.id || randomUUID();
  const encrypted = input.token ? encryptSecret(input.token) : existing?.encrypted_credentials || input.tokenEncrypted || null;
  const config = {
    connected: input.connected, installationOwnedByHomiOS: input.installationOwnedByHomiOS,
    teamId: input.teamId, serverUuid: input.serverUuid, destinationUuid: input.destinationUuid,
    projectUuid: input.projectUuid,
    environmentUuid: input.environmentUuid, lastValidatedAt: input.lastValidatedAt,
    coolifyVersion: input.coolifyVersion, storageAware: input.storageAware,
  };
  getDb().prepare(`INSERT INTO integrations (id, provider, mode, base_url, encrypted_credentials, config_json)
    VALUES (?, 'coolify', ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET mode=excluded.mode, base_url=excluded.base_url,
      encrypted_credentials=excluded.encrypted_credentials, config_json=excluded.config_json, updated_at=CURRENT_TIMESTAMP`)
    .run(id, input.mode, input.baseUrl, encrypted, JSON.stringify(config));
  return getCoolifyIntegration()!;
}

export function getCoolifyProvider() {
  const integration = getCoolifyIntegration();
  if (!integration?.connected || !integration.baseUrl || !integration.tokenEncrypted || !integration.projectUuid || !integration.environmentUuid || !integration.serverUuid) {
    throw new Error('Coolify is not connected to the HomiOS App Store');
  }
  return new CoolifyProvider(new CoolifyClient(integration.baseUrl, decryptSecret(integration.tokenEncrypted)), {
    projectUuid: integration.projectUuid, environmentUuid: integration.environmentUuid,
    serverUuid: integration.serverUuid, destinationUuid: integration.destinationUuid || undefined,
  });
}

function isLocalServer(server: any) {
  const values = [server?.ip, server?.name, server?.description]
    .map((value) => String(value || '').trim().toLowerCase());
  return values.some((value) => ['127.0.0.1', 'localhost', '::1', 'host.docker.internal'].includes(value))
    || values.some((value) => /(^|[\s_-])(local|localhost|coolify)([\s_-]|$)/.test(value));
}

export async function connectCoolify(input: {
  baseUrl: string;
  token: string;
  mode?: CoolifyMode;
  serverUuid?: string;
  destinationUuid?: string;
  conflictResolution?: 'use-existing' | 'create-new';
}) {
  const baseUrl = normalizeCoolifyBaseUrl(input.baseUrl);
  const client = new CoolifyClient(baseUrl, input.token);
  const previous = getCoolifyIntegration();
  const canReusePrevious = previous?.baseUrl === baseUrl;
  const [projects, servers, currentTeam, versionResult, destinations] = await Promise.all([
    client.listProjects(), client.listServers(), client.getCurrentTeam(), client.getVersion(), client.listDestinations(),
  ]);
  const eligible = servers.filter((server) => server?.settings?.is_reachable !== false && server?.settings?.is_usable !== false);
  const requestedServerUuid = input.serverUuid || (canReusePrevious ? previous?.serverUuid || undefined : undefined);
  const server = requestedServerUuid
    ? eligible.find((item) => item.uuid === requestedServerUuid)
    : eligible.length === 1 ? eligible[0] : eligible.find(isLocalServer);
  if (!server) return { needsServerSelection: true as const, servers: eligible.map(({ uuid, name, ip }) => ({ uuid, name, ip })) };

  // Resolve every user choice before creating a project or environment. This
  // keeps a connection attempt side-effect free until it has enough information
  // to finish successfully.
  const serverDestinations = destinations.filter((item) => item?.server_uuid === server.uuid || item?.server?.uuid === server.uuid);
  const requestedDestinationUuid = input.destinationUuid
    || (canReusePrevious && previous?.serverUuid === server.uuid ? previous?.destinationUuid || undefined : undefined);
  const destination = requestedDestinationUuid
    ? serverDestinations.find((item) => item.uuid === requestedDestinationUuid)
    : serverDestinations.length === 1 ? serverDestinations[0] : undefined;
  if (requestedDestinationUuid && !destination && serverDestinations.length) {
    return {
      needsDestinationSelection: true as const,
      destinations: serverDestinations.map(({ uuid, name, network, type }) => ({ uuid, name, network, type })),
    };
  }
  if (!requestedDestinationUuid && serverDestinations.length > 1) {
    return {
      needsDestinationSelection: true as const,
      destinations: serverDestinations.map(({ uuid, name, network, type }) => ({ uuid, name, network, type })),
    };
  }

  const savedProject = canReusePrevious && previous?.projectUuid
    ? projects.find((item) => item.uuid === previous.projectUuid)
    : undefined;
  let project = savedProject || projects.find((item) => item.name === 'HomiOS-Apps');
  if (project && !savedProject && !input.conflictResolution) return { needsProjectSelection: true as const, project: { uuid: project.uuid, name: project.name } };
  // A UUID previously stored by HomiOS is ownership evidence. Reuse it even if
  // the caller asks for create-new during a managed startup retry.
  if (project && !savedProject && input.conflictResolution === 'create-new') {
    let suffix = 2;
    while (projects.some((item) => item.name === `HomiOS-Apps-${suffix}`)) suffix++;
    project = await client.createProject(`HomiOS-Apps-${suffix}`, 'HomiOS-owned App Store resources');
  } else if (!project) project = await client.createProject('HomiOS-Apps', 'HomiOS-owned App Store resources');

  let environment: any;
  try {
    const savedEnvironmentUuid = savedProject && canReusePrevious ? previous?.environmentUuid : null;
    environment = await client.getEnvironment(project.uuid, savedEnvironmentUuid || 'production');
  }
  catch (error) {
    if (!(error instanceof CoolifyApiError) || error.status !== 404) throw error;
    environment = await client.createEnvironment(project.uuid, 'production');
  }
  const version = typeof versionResult === 'string' ? versionResult : versionResult?.version;
  const record = saveCoolifyIntegration({
    mode: input.mode || 'external', baseUrl, token: input.token, tokenEncrypted: null,
    connected: true, installationOwnedByHomiOS: input.mode === 'managed', teamId: currentTeam?.id,
    serverUuid: server.uuid, destinationUuid: destination?.uuid || null,
    projectUuid: project.uuid, environmentUuid: String(environment.uuid || environment.id || 'production'),
    lastValidatedAt: new Date().toISOString(), coolifyVersion: version,
    storageAware: ['127.0.0.1', 'localhost', '::1', 'host.docker.internal'].includes(String(server.ip || '').toLowerCase()),
  });
  return { connected: true as const, integration: { ...record, tokenEncrypted: record.tokenEncrypted ? '[encrypted]' : null } };
}

export function disconnectCoolify() {
  const current = getCoolifyIntegration();
  if (!current) return;
  saveCoolifyIntegration({ ...current, connected: false, tokenEncrypted: null });
  getDb().prepare("UPDATE integrations SET encrypted_credentials = NULL WHERE provider = 'coolify'").run();
}
