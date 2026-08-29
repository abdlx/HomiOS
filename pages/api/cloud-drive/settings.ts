import { withAuth } from '../../../lib/api-auth.ts';
import { getCloudDriveIntegration, saveCloudDriveIntegration } from '../../../lib/cloud-drive-settings.ts';
import { internalCloudHeaders } from '../../../lib/cloud-storage-runtime.ts';

function publicOrigin(req: any) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (req.socket?.encrypted ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host ? `${protocol}://${host}` : '';
}

async function upstream(baseUrl: string, apiKey: string, pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}/api/v1${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...internalCloudHeaders(), ...init.headers },
  });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw Object.assign(new Error(body.message || body.error || `Cloud service returned HTTP ${response.status}`), { status: response.status });
  return body;
}

export default withAuth(async function handler(req: any, res: any) {
  const saved = getCloudDriveIntegration();

  if (req.method === 'GET') {
    let remote: any = null;
    let accounts = 0;
    let status: 'ready' | 'unconfigured' | 'unavailable' = saved.configured ? 'unavailable' : 'unconfigured';
    if (saved.configured) {
      try {
        [remote, accounts] = await Promise.all([
          upstream(saved.baseUrl, saved.apiKey, '/system/google-config'),
          upstream(saved.baseUrl, saved.apiKey, '/accounts').then((value) => value.accounts?.length || 0),
        ]);
        status = remote?.exists ? 'ready' : 'unconfigured';
      } catch {}
    }
    return res.json({
      configured: true,
      status,
      clientId: remote?.clientId || saved.clientId,
      hasSecret: Boolean(remote?.hasSecret || saved.hasSecret),
      redirectUri: remote?.redirectUri || saved.redirectUri || `${publicOrigin(req)}/api/cloud-drive/oauth-callback`,
      accounts,
    });
  }

  if (req.method === 'PUT') {
    const baseUrl = saved.baseUrl;
    const apiKey = saved.apiKey;
    const clientId = String(req.body?.clientId || '').trim();
    const clientSecret = String(req.body?.clientSecret || '').trim();
    const redirectUri = `${publicOrigin(req)}/api/cloud-drive/oauth-callback`;
    if (!clientId) return res.status(400).json({ error: 'Enter the Google OAuth Client ID.' });
    try {
      const existing = await upstream(baseUrl, apiKey, '/system/google-config');
      if (!clientSecret && !existing.hasSecret) return res.status(400).json({ error: 'Enter the Google OAuth Client Secret for first-time setup.' });
      await upstream(baseUrl, apiKey, '/system/google-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri }),
      });
      saveCloudDriveIntegration({ clientId, redirectUri, hasSecret: Boolean(clientSecret || existing.hasSecret) });
      return res.json({ ok: true, configured: true, status: 'ready', clientId, redirectUri, hasSecret: true });
    } catch (error: any) {
      return res.status(error?.status >= 400 && error?.status < 500 ? error.status : 502).json({ error: error?.message || 'Could not configure cloud storage.' });
    }
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).end();
}, { adminOnly: true, ability: 'write' });
