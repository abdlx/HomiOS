import { randomUUID } from 'node:crypto';
import { getDb } from './db.ts';
import { getCloudStorageRuntime } from './cloud-storage-runtime.ts';

const PROVIDER = 'cloud-drive';

export interface CloudDriveIntegration {
  baseUrl: string;
  apiKey: string;
  clientId: string;
  redirectUri: string;
  configured: boolean;
  hasSecret: boolean;
}

export function getCloudDriveIntegration(): CloudDriveIntegration {
  const row = getDb().prepare('SELECT * FROM integrations WHERE provider = ?').get(PROVIDER) as any;
  const config = row ? JSON.parse(row.config_json || '{}') : {};
  const runtime = getCloudStorageRuntime();
  return {
    baseUrl: runtime.baseUrl,
    apiKey: runtime.internalKey,
    clientId: String(config.clientId || ''),
    redirectUri: String(config.redirectUri || ''),
    configured: true,
    hasSecret: Boolean(config.hasSecret),
  };
}

export function saveCloudDriveIntegration(input: {
  clientId: string;
  redirectUri: string;
  hasSecret: boolean;
}) {
  const id = (getDb().prepare('SELECT id FROM integrations WHERE provider = ?').get(PROVIDER) as any)?.id || randomUUID();
  getDb().prepare(`INSERT INTO integrations (id, provider, mode, base_url, encrypted_credentials, config_json)
    VALUES (?, ?, 'internal', NULL, NULL, ?)
    ON CONFLICT(provider) DO UPDATE SET mode=excluded.mode, base_url=excluded.base_url,
      encrypted_credentials=excluded.encrypted_credentials, config_json=excluded.config_json,
      updated_at=CURRENT_TIMESTAMP`)
    .run(id, PROVIDER, JSON.stringify({
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      hasSecret: input.hasSecret,
    }));
  return getCloudDriveIntegration();
}
