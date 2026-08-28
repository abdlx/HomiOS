import { getDb } from '../db.ts';
import { CoolifyApiError } from './providers/coolify.ts';
import { getCoolifyIntegration, getCoolifyProvider } from './integration-storage.ts';
import { listManagedApps } from './app-service.ts';
import { getCatalogApp } from './registry.ts';
import { listAppStorageMounts } from './mount-inventory.ts';

export async function reconcileManagedApps() {
  const provider = getCoolifyProvider();
  const integration = getCoolifyIntegration();
  const results: Array<{ id: string; status: string }> = [];
  for (const app of listManagedApps()) {
    let status = app.status;
    let primaryUrl = app.primaryUrl;
    try {
      const template = getCatalogApp(app.catalogId);
      if (integration?.storageAware && template?.storage.length) {
        const mounts = listAppStorageMounts();
        const changes = await provider.configureStorage(app.providerResourceUuid, mounts);
        if (changes.added || changes.removed) {
          await provider.deployApp(app.providerResourceUuid);
          const requirements = 'requirements' in app.storage ? app.storage.requirements : app.storage;
          getDb().prepare('UPDATE managed_apps SET storage_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
            .run(JSON.stringify({ requirements, mounts }), app.id);
        }
      }
      const runtime = await provider.getApp(app.providerResourceUuid);
      status = runtime.status;
      primaryUrl = runtime.primaryUrl || primaryUrl;
    } catch (error) {
      if (error instanceof CoolifyApiError && error.status === 404) status = 'missing';
      else if (error instanceof CoolifyApiError && error.status === 401) throw error;
      else status = 'unknown';
    }
    getDb().prepare('UPDATE managed_apps SET status=?, primary_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .run(status, primaryUrl, app.id);
    results.push({ id: app.id, status });
  }
  return results;
}
