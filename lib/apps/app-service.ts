import { randomUUID } from 'crypto';
import { getDb, withTransaction } from '../db.ts';
import { logAudit } from '../audit.ts';
import { createNotification } from '../notifications.ts';
import { getCatalogApp } from './registry.ts';
import { getCoolifyProvider } from './integration-storage.ts';
import { assertManagedOwnership } from './ownership.ts';
import { validateStorageSelection } from './storage.ts';
import type { AppDomainRoute, ManagedApp } from './types.ts';

function parse(value: string | null | undefined) {
  try { return value ? JSON.parse(value) : {}; } catch { return {}; }
}

export function mapManagedApp(row: any): ManagedApp {
  return {
    id: row.id, catalogId: row.catalog_id, provider: 'coolify',
    providerResourceUuid: row.provider_resource_uuid,
    providerProjectUuid: row.provider_project_uuid,
    providerEnvironmentUuid: row.provider_environment_uuid,
    providerServerUuid: row.provider_server_uuid,
    name: row.display_name, status: row.status, primaryUrl: row.primary_url || null,
    storage: parse(row.storage_json), managedByHomiOS: !!row.managed,
    metadataVersion: row.metadata_version || 1,
    installedAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function listManagedApps() {
  return (getDb().prepare('SELECT * FROM managed_apps WHERE removed_at IS NULL ORDER BY display_name').all() as any[]).map(mapManagedApp);
}

export function getManagedApp(id: string) {
  const row = getDb().prepare('SELECT * FROM managed_apps WHERE id = ? AND removed_at IS NULL').get(id);
  return row ? mapManagedApp(row) : null;
}

export function createInstallJobRecord(jobId: string, catalogId: string) {
  getDb().prepare("INSERT INTO app_install_jobs (id, job_id, catalog_id, stage) VALUES (?, ?, ?, 'pending')")
    .run(randomUUID(), jobId, catalogId);
}

export function findActiveInstall(catalogId: string) {
  return getDb().prepare(`SELECT j.id, j.status FROM jobs j
    WHERE j.type='app.install' AND j.status IN ('queued','running','paused')
      AND json_extract(j.payload, '$.appId')=? ORDER BY j.created_at DESC LIMIT 1`).get(catalogId) as { id: string; status: string } | undefined;
}

function updateInstall(jobId: string, stage: string, appId?: string, error?: string) {
  getDb().prepare(`UPDATE app_install_jobs SET stage=?, app_id=COALESCE(?, app_id), error=?, updated_at=CURRENT_TIMESTAMP WHERE job_id=?`)
    .run(stage, appId || null, error || null, jobId);
}

export async function runAppInstall(input: {
  jobId: string; catalogId: string; storage?: Record<string, string>; serverUuid?: string;
  teamId?: string; userId?: number; onProgress: (progress: number, message?: string, data?: any) => void;
}) {
  const template = getCatalogApp(input.catalogId);
  if (!template) throw new Error('App is not in the HomiOS catalog');
  if (getDb().prepare('SELECT 1 FROM managed_apps WHERE catalog_id=? AND removed_at IS NULL').get(template.id)) {
    throw new Error(`${template.name} is already installed`);
  }
  const storage = validateStorageSelection(template, input.storage || {});
  if (Object.keys(storage).length) {
    throw new Error('Host bind-storage configuration is not supported by this Coolify API version yet');
  }
  const provider = getCoolifyProvider();
  let appId: string | undefined;
  try {
    updateInstall(input.jobId, 'creating');
    input.onProgress(15, 'Creating Coolify service', { stage: 'creating', appId: template.id });
    const runtime = await provider.installApp(template, { storage, serverUuid: input.serverUuid });
    const managedId = randomUUID();
    appId = managedId;
    withTransaction((db) => {
      db.prepare(`INSERT INTO managed_apps (
        id, catalog_id, provider, provider_resource_uuid, provider_project_uuid,
        provider_environment_uuid, provider_server_uuid, display_name, primary_url,
        status, storage_json, managed, metadata_version
      ) VALUES (?, ?, 'coolify', ?, ?, ?, ?, ?, ?, 'installing', ?, 1, ?)`)
        .run(managedId, template.id, runtime.id, provider.config.projectUuid,
          provider.config.environmentUuid, input.serverUuid || provider.config.serverUuid,
          template.name, runtime.primaryUrl, JSON.stringify(storage), template.schemaVersion);
      db.prepare('UPDATE app_install_jobs SET app_id=?, stage=?, updated_at=CURRENT_TIMESTAMP WHERE job_id=?')
        .run(managedId, 'configuring', input.jobId);
    });
    input.onProgress(45, 'Preparing application configuration', { stage: 'configuring', appId: template.id });
    updateInstall(input.jobId, 'deploying', managedId);
    getDb().prepare("UPDATE managed_apps SET status='deploying', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(managedId);
    input.onProgress(70, 'Starting containers', { stage: 'deploying', appId: template.id });
    await provider.deployApp(runtime.id);
    updateInstall(input.jobId, 'health_check', managedId);
    input.onProgress(90, 'Deployment queued; waiting for Coolify health', { stage: 'health_check', appId: template.id });
    let latest = runtime;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try { latest = await provider.getApp(runtime.id); } catch {}
      if (latest.status === 'running') break;
    }
    const finalStatus = latest.status === 'unknown' ? 'deploying' : latest.status;
    getDb().prepare('UPDATE managed_apps SET status=?, primary_url=COALESCE(?, primary_url), updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(finalStatus, latest.primaryUrl, managedId);
    updateInstall(input.jobId, finalStatus === 'running' ? 'running' : 'deploying', managedId);
    logAudit({ teamId: input.teamId, userId: input.userId, action: 'app.install.completed', resourceType: 'managed_app', resourceId: managedId, meta: { catalogId: template.id, resourceUuid: runtime.id } });
    createNotification({ teamId: input.teamId, userId: input.userId, title: `${template.name} installed`, message: finalStatus === 'running' ? 'The app is ready to open.' : 'Coolify is finishing the deployment.', tone: 'success', sourceType: 'app', sourceId: managedId });
    return { appId: managedId, resourceUuid: runtime.id, status: finalStatus };
  } catch (error: any) {
    updateInstall(input.jobId, 'failed_deploy', appId, error?.message || 'Install failed');
    if (appId) getDb().prepare("UPDATE managed_apps SET status='error', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(appId);
    logAudit({ teamId: input.teamId, userId: input.userId, action: 'app.install.failed', resourceType: 'managed_app', resourceId: appId, meta: { catalogId: input.catalogId, error: error?.message } });
    throw error;
  }
}

export async function performAppAction(appId: string, action: 'start' | 'stop' | 'restart' | 'deploy', actor: { teamId?: string; userId?: number }) {
  const row = assertManagedOwnership(appId);
  const provider = getCoolifyProvider();
  await ({ start: provider.startApp.bind(provider), stop: provider.stopApp.bind(provider), restart: provider.restartApp.bind(provider), deploy: provider.deployApp.bind(provider) }[action])(row.provider_resource_uuid);
  const status = action === 'stop' ? 'stopped' : action === 'deploy' ? 'deploying' : 'running';
  getDb().prepare('UPDATE managed_apps SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, appId);
  logAudit({ ...actor, action: `app.${action === 'deploy' ? 'deployed' : action + 'ed'}`, resourceType: 'managed_app', resourceId: appId });
  return getManagedApp(appId);
}

export async function getAppLogs(appId: string) {
  const row = assertManagedOwnership(appId);
  return getCoolifyProvider().getLogs(row.provider_resource_uuid);
}

function normalizeDomainRoute(route: AppDomainRoute): AppDomainRoute {
  const name = String(route?.name || '').trim();
  const value = String(route?.url || '').trim();
  if (!name || name.length > 255) throw new Error('Each address requires a valid service name');
  if (!value) return { name, url: '' };
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Invalid app address: ${value}`); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error(`App addresses must be full HTTP(S) URLs without credentials, query strings, or fragments`);
  }
  return { name, url: url.toString().replace(/\/$/, url.pathname === '/' ? '' : '/') };
}

export async function getAppDomains(appId: string) {
  const row = assertManagedOwnership(appId);
  return getCoolifyProvider().getDomains(row.provider_resource_uuid);
}

export async function updateAppDomains(appId: string, routes: AppDomainRoute[], force: boolean, actor: { teamId?: string; userId?: number }) {
  const row = assertManagedOwnership(appId);
  if (!Array.isArray(routes) || routes.length > 20) throw new Error('Provide up to 20 app addresses');
  const normalized = routes.map(normalizeDomainRoute);
  const runtime = await getCoolifyProvider().updateDomains(row.provider_resource_uuid, normalized, force);
  const primaryUrl = runtime.primaryUrl || normalized.find((route) => route.url)?.url || null;
  getDb().prepare('UPDATE managed_apps SET primary_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(primaryUrl, appId);
  logAudit({ ...actor, action: 'app.domains.updated', resourceType: 'managed_app', resourceId: appId, meta: { domains: normalized.map((route) => route.url).filter(Boolean) } });
  return { routes: normalized, app: getManagedApp(appId) };
}

export async function removeManagedApp(appId: string, actor: { teamId?: string; userId?: number }) {
  const row = assertManagedOwnership(appId);
  await getCoolifyProvider().removeApp(row.provider_resource_uuid);
  getDb().prepare("UPDATE managed_apps SET removed_at=CURRENT_TIMESTAMP, status='stopped', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(appId);
  logAudit({ ...actor, action: 'app.removed', resourceType: 'managed_app', resourceId: appId, meta: { dataPreserved: true } });
}
