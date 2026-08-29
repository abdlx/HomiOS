import { randomUUID } from 'node:crypto';
import { decryptSecret, encryptSecret } from './crypto.ts';
import { getDb } from './db.ts';

const PROVIDER = 'cloud-drive';

export interface CloudDriveIntegration {
  baseUrl: string;
  apiKey: string;
  clientId: string;
  redirectUri: string;
  configured: boolean;
  hasSecret: boolean;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

export function getCloudDriveIntegration(): CloudDriveIntegration {
  const row = getDb().prepare('SELECT * FROM integrations WHERE provider = ?').get(PROVIDER) as any;
  const config = row ? JSON.parse(row.config_json || '{}') : {};
  const apiKey = row?.encrypted_credentials ? decryptSecret(row.encrypted_credentials) : (process.env.NINEDRIVE_API_KEY || '');
  const baseUrl = normalizeBaseUrl(row?.base_url || process.env.NINEDRIVE_API_URL || '');
  return {
    baseUrl,
    apiKey,
    clientId: String(config.clientId || process.env.GOOGLE_CLIENT_ID || ''),
    redirectUri: String(config.redirectUri || process.env.GOOGLE_REDIRECT_URI || ''),
    configured: Boolean(baseUrl && apiKey),
    hasSecret: Boolean(config.hasSecret || process.env.GOOGLE_CLIENT_SECRET),
  };
}

export function saveCloudDriveIntegration(input: {
  baseUrl: string;
  apiKey: string;
  clientId: string;
  redirectUri: string;
  hasSecret: boolean;
}) {
  const id = (getDb().prepare('SELECT id FROM integrations WHERE provider = ?').get(PROVIDER) as any)?.id || randomUUID();
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  getDb().prepare(`INSERT INTO integrations (id, provider, mode, base_url, encrypted_credentials, config_json)
    VALUES (?, ?, 'managed', ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET mode=excluded.mode, base_url=excluded.base_url,
      encrypted_credentials=excluded.encrypted_credentials, config_json=excluded.config_json,
      updated_at=CURRENT_TIMESTAMP`)
    .run(id, PROVIDER, baseUrl, encryptSecret(input.apiKey), JSON.stringify({
      clientId: input.clientId,
      redirectUri: input.redirectUri,
      hasSecret: input.hasSecret,
    }));
  return getCloudDriveIntegration();
}

export function normalizeCloudDriveBaseUrl(value: string) {
  return normalizeBaseUrl(value);
}
