import { withAuth } from '../../../lib/api-auth.ts';
import { getCloudDriveIntegration } from '../../../lib/cloud-drive-settings.ts';
import { internalCloudHeaders } from '../../../lib/cloud-storage-runtime.ts';

export default withAuth(async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();
  const base = getCloudDriveIntegration().baseUrl;
  if (!base) return res.status(503).json({ error: 'Cloud storage is not configured' });
  const query = new URLSearchParams({ code: String(req.query.code || ''), state: String(req.query.state || '') });
  const upstream = await fetch(`${base}/connected-accounts/google/callback?${query}`, { headers: internalCloudHeaders(), redirect: 'manual' });
  const location = upstream.headers.get('location');
  if (location) return res.redirect(302, `/google-connected?status=${location.includes('status=success') ? 'success' : 'error'}`);
  return res.status(upstream.status).send(await upstream.text());
}, { adminOnly: true });
