import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../lib/db.ts';
import { CoolifyApiError } from '../../lib/apps/providers/coolify.ts';

const getApp = vi.fn();
vi.mock('../../lib/apps/integration-storage.ts', () => ({ getCoolifyProvider: () => ({ getApp }) }));
import { reconcileManagedApps } from '../../lib/apps/reconciliation.ts';

describe('managed app reconciliation', () => {
  beforeEach(() => {
    getApp.mockReset();
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
});
