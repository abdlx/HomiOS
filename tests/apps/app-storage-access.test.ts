import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../lib/db.ts';

const configureStorage = vi.fn();
const deployApp = vi.fn();
vi.mock('../../lib/apps/integration-storage.ts', () => ({
  getCoolifyIntegration: () => ({ storageAware: true }),
  getCoolifyProvider: () => ({ configureStorage, deployApp }),
}));
vi.mock('../../lib/apps/mount-inventory.ts', () => ({
  listAppStorageMounts: () => [{ id: 'mount-1', name: 'sda1', path: '/mnt/homios-storage/sda1', readOnly: false }],
  withAllHomiOSStorageAccess: (mounts: any[]) => [
    { id: 'homios-storage-root', name: 'All HomiOS storage', path: '/mnt/homios-storage', source: '/mnt/homios-storage', readOnly: false },
    ...mounts,
  ],
  resolveAppStorageMounts: vi.fn(),
}));

import { setAppAllStorageAccess } from '../../lib/apps/app-service.ts';

describe('managed app all-storage access', () => {
  beforeEach(() => {
    configureStorage.mockReset();
    deployApp.mockReset();
    const db = getDb();
    db.exec("DELETE FROM managed_apps; DELETE FROM integrations WHERE provider='coolify'");
    db.prepare("INSERT INTO integrations (id,provider,mode,base_url,config_json) VALUES ('i','coolify','external','http://coolify.test',?)")
      .run(JSON.stringify({ projectUuid: 'project-1' }));
    db.prepare(`INSERT INTO managed_apps (id,catalog_id,provider,provider_resource_uuid,provider_project_uuid,provider_environment_uuid,provider_server_uuid,display_name,managed,storage_json)
      VALUES ('app-1','jellyfin','coolify','resource-1','project-1','env-1','server-1','Jellyfin',1,?)`)
      .run(JSON.stringify({ requirements: {}, mounts: [{ id: 'mount-1', path: '/mnt/homios-storage/sda1' }], selectedMountIds: ['mount-1'] }));
  });

  it('grants root access and can revoke it back to the selected app-data mounts', async () => {
    configureStorage.mockResolvedValueOnce({ added: 1, removed: 0 });
    await setAppAllStorageAccess('app-1', true, {});
    expect(configureStorage).toHaveBeenLastCalledWith('resource-1', [
      expect.objectContaining({ id: 'homios-storage-root' }),
      expect.objectContaining({ id: 'mount-1' }),
    ]);
    expect(deployApp).toHaveBeenCalledWith('resource-1');
    expect(JSON.parse((getDb().prepare("SELECT storage_json FROM managed_apps WHERE id='app-1'").get() as any).storage_json))
      .toMatchObject({ accessAllMounts: true, selectedMountIds: ['mount-1'] });

    configureStorage.mockResolvedValueOnce({ added: 0, removed: 1 });
    await setAppAllStorageAccess('app-1', false, {});
    expect(configureStorage).toHaveBeenLastCalledWith('resource-1', [expect.objectContaining({ id: 'mount-1' })]);
    expect(JSON.parse((getDb().prepare("SELECT storage_json FROM managed_apps WHERE id='app-1'").get() as any).storage_json))
      .toMatchObject({ accessAllMounts: false, selectedMountIds: ['mount-1'] });
  });
});
