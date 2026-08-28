import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../lib/db.ts';
import { assertManagedOwnership } from '../../lib/apps/ownership.ts';

describe('managed app ownership', () => {
  beforeEach(() => {
    const db = getDb();
    db.exec('DELETE FROM managed_apps; DELETE FROM integrations;');
    db.prepare("INSERT INTO integrations (id,provider,mode,base_url,config_json) VALUES ('i','coolify','external','http://coolify.test',?)")
      .run(JSON.stringify({ connected: true, projectUuid: 'project-owned' }));
    db.prepare(`INSERT INTO managed_apps (id,catalog_id,provider,provider_resource_uuid,provider_project_uuid,provider_environment_uuid,provider_server_uuid,display_name,managed)
      VALUES ('app-1','uptime-kuma','coolify','resource-1','project-owned','env-1','server-1','Uptime Kuma',1)`).run();
  });

  it('requires both a registry record and the saved project UUID', () => {
    expect(assertManagedOwnership('app-1').provider_resource_uuid).toBe('resource-1');
    expect(() => assertManagedOwnership('unknown')).toThrow(/not found/);
    getDb().prepare("UPDATE managed_apps SET provider_project_uuid='other-project' WHERE id='app-1'").run();
    expect(() => assertManagedOwnership('app-1')).toThrow(/Ownership check failed/);
  });
});
