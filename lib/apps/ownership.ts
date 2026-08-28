import { getDb } from '../db.ts';

export function assertManagedOwnership(appId: string) {
  const row = getDb().prepare(`
    SELECT m.*, i.config_json FROM managed_apps m
    JOIN integrations i ON i.provider = m.provider
    WHERE m.id = ? AND m.removed_at IS NULL
  `).get(appId) as any;
  if (!row) throw new Error('Managed app not found');
  const config = JSON.parse(row.config_json || '{}');
  if (!row.managed || row.provider_project_uuid !== config.projectUuid) {
    throw new Error('Ownership check failed: resource is outside the HomiOS-owned project');
  }
  return row;
}
