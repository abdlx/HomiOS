import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../lib/db.ts';
import { CoolifyApiError } from '../../lib/apps/providers/coolify.ts';

const { listInstalledApps, getApp, removeApp } = vi.hoisted(() => ({
  listInstalledApps: vi.fn(), getApp: vi.fn(), removeApp: vi.fn(),
}));
vi.mock('../../lib/apps/integration-storage.ts', () => ({
  getCoolifyIntegration: () => ({ connected: true }),
  getCoolifyProvider: () => ({ listInstalledApps, getApp, removeApp, config: { projectUuid: 'project-owned', environmentUuid: 'env-1' } }),
}));
import { getManagedApp, listDesktopApps, removeManagedApp } from '../../lib/apps/app-service.ts';

describe('desktop Coolify inventory and removal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const db = getDb();
    db.exec('DELETE FROM managed_apps; DELETE FROM integrations;');
    db.prepare("INSERT INTO integrations (id,provider,mode,base_url,config_json) VALUES ('i','coolify','external','http://coolify.test',?)")
      .run(JSON.stringify({ connected: true, projectUuid: 'project-owned' }));
    db.prepare(`INSERT INTO managed_apps (id,catalog_id,provider,provider_resource_uuid,provider_project_uuid,provider_environment_uuid,provider_server_uuid,display_name,managed,status)
      VALUES ('app-1','uptime-kuma','coolify','resource-1','project-owned','env-1','server-1','Uptime Kuma',1,'running')`).run();
    listInstalledApps.mockResolvedValue([]);
    getApp.mockRejectedValue(new CoolifyApiError('Not found', 404));
  });

  it('hides removed managed services while including custom applications and services', async () => {
    listInstalledApps.mockResolvedValue([
      { id: 'custom-app', name: 'Custom', status: 'running', resourceType: 'application', primaryUrl: 'https://custom.test' },
      { id: 'custom-service', name: 'Service', status: 'running', resourceType: 'service', primaryUrl: 'https://service.test' },
    ]);
    expect(await listDesktopApps()).toEqual([
      expect.objectContaining({ id: 'application:custom-app', managedByHomiOS: false }),
      expect.objectContaining({ id: 'service:custom-service', managedByHomiOS: false }),
    ]);
    expect(getManagedApp('app-1')?.status).toBe('missing');
    expect(listInstalledApps).toHaveBeenCalledWith({ scope: 'team' });
  });

  it('restores a previously missing managed service without duplicating its discovered entry', async () => {
    getDb().prepare("UPDATE managed_apps SET status='missing' WHERE id='app-1'").run();
    listInstalledApps.mockResolvedValue([{ id: 'resource-1', name: 'Runtime name', status: 'running', resourceType: 'service', primaryUrl: 'https://kuma.test' }]);
    expect(await listDesktopApps()).toEqual([expect.objectContaining({ id: 'app-1', status: 'running', primaryUrl: 'https://kuma.test', managedByHomiOS: true })]);
    expect(getApp).not.toHaveBeenCalled();
  });

  it('preserves records when inventory fails or a missing resource cannot be confirmed', async () => {
    listInstalledApps.mockRejectedValueOnce(new Error('Offline'));
    await expect(listDesktopApps()).rejects.toThrow('Offline');
    expect(getManagedApp('app-1')?.status).toBe('running');
    getApp.mockRejectedValueOnce(new CoolifyApiError('Forbidden', 403));
    await expect(listDesktopApps()).rejects.toMatchObject({ status: 403 });
    expect(getManagedApp('app-1')?.status).toBe('running');
  });

  it('allows removal of an owned registry entry when Coolify already deleted the service', async () => {
    removeApp.mockRejectedValueOnce(new CoolifyApiError('Not found', 404));
    await removeManagedApp('app-1', {});
    expect(getManagedApp('app-1')).toBeNull();
    expect(removeApp).toHaveBeenCalledWith('resource-1');
  });

  it('does not forget a service on permission failures or bypass ownership', async () => {
    removeApp.mockRejectedValueOnce(new CoolifyApiError('Forbidden', 403));
    await expect(removeManagedApp('app-1', {})).rejects.toMatchObject({ status: 403 });
    expect(getManagedApp('app-1')).not.toBeNull();
    getDb().prepare("UPDATE managed_apps SET managed=0 WHERE id='app-1'").run();
    await expect(removeManagedApp('app-1', {})).rejects.toThrow(/Ownership/);
    expect(removeApp).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect an app removed while its inventory request was in flight', async () => {
    let resolveInventory!: (apps: any[]) => void;
    listInstalledApps.mockReturnValueOnce(new Promise((resolve) => { resolveInventory = resolve; }));
    const pending = listDesktopApps();
    await removeManagedApp('app-1', {});
    resolveInventory([{ id: 'resource-1', name: 'Uptime Kuma', status: 'running', resourceType: 'service', primaryUrl: null }]);
    await expect(pending).resolves.toEqual([]);
    expect(getManagedApp('app-1')).toBeNull();
  });
});
