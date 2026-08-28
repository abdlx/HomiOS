import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../lib/db.ts';
import { CoolifyApiError } from '../../lib/apps/providers/coolify.ts';

const getApp = vi.fn();
const configureStorage = vi.fn();
const deployApp = vi.fn();
let storageAware = false;
vi.mock('../../lib/apps/integration-storage.ts', () => ({
  getCoolifyIntegration: () => ({ storageAware }),
  getCoolifyProvider: () => ({ getApp, configureStorage, deployApp }),
}));
vi.mock('../../lib/apps/mount-inventory.ts', () => ({
  listAppStorageMounts: () => [{ id: 'mount-1', name: 'sda1', path: '/mnt/homios-storage/sda1', readOnly: false }],
}));
import { reconcileManagedApps } from '../../lib/apps/reconciliation.ts';

describe('managed app reconciliation', () => {
  beforeEach(() => {
    getApp.mockReset();
    configureStorage.mockReset();
    deployApp.mockReset();
    storageAware = false;
    const db = getDb();
    db.exec('DELETE FROM managed_apps');
    db.prepare(`INSERT INTO managed_apps (id,catalog_id,provider,provider_resource_uuid,provider_project_uuid,provider_environment_uuid,provider_server_uuid,display_name,managed)
      VALUES ('app-1','uptime-kuma','coolify','resource-1','project-1','env-1','server-1','Uptime Kuma',1)`).run();
  });

  it('marks resources deleted directly in Coolify as missing without recreating them', async () => {
    getApp.mockRejectedValue(new CoolifyApiError('Not found', 404));
    await reconcileManagedApps();
    expect(getApp).toHaveBeenCalledTimes(1);
    expect(getDb().prepare("SELECT status FROM managed_apps WHERE id='app-1'").get()).toMatchObject({ status: 'missing' });
  });

  it('adds newly mounted HomiOS drives to existing storage-aware apps and redeploys once', async () => {
    storageAware = true;
    getDb().prepare("UPDATE managed_apps SET catalog_id='immich', display_name='Immich' WHERE id='app-1'").run();
    configureStorage.mockResolvedValue({ added: 1, removed: 0 });
    getApp.mockResolvedValue({ id: 'resource-1', name: 'Immich', status: 'running', primaryUrl: null });

    await reconcileManagedApps();

    expect(configureStorage).toHaveBeenCalledWith('resource-1', [expect.objectContaining({ id: 'mount-1' })]);
    expect(deployApp).toHaveBeenCalledWith('resource-1');
    const row = getDb().prepare("SELECT storage_json FROM managed_apps WHERE id='app-1'").get() as any;
    expect(JSON.parse(row.storage_json).mounts).toEqual([expect.objectContaining({ path: '/mnt/homios-storage/sda1' })]);
  });
});
