import { connectCoolify } from './integration-storage.ts';

/**
 * Single abstraction for managed-install credential bootstrapping. The installer
 * may populate these values via scripts/coolify-bootstrap-api.sh. Runtime retries
 * the same safe project/environment initialization after reboot.
 */
export async function bootstrapManagedCoolifyIntegration() {
  const baseUrl = process.env.COOLIFY_URL || `http://127.0.0.1:${process.env.COOLIFY_APP_PORT || 8000}`;
  const token = process.env.COOLIFY_API_TOKEN;
  if (!token) throw new Error('Managed Coolify API bootstrap requires a supported integration token; use the manual token fallback');
  return connectCoolify({ baseUrl, token, mode: 'managed', conflictResolution: 'create-new' });
}
