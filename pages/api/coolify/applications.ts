/**
 * /api/coolify/applications — read-only inventory of the Coolify sidecar's apps/services.
 *
 * Authenticated: this leaks the deployed-app inventory (names, projects, public FQDNs),
 * which is reconnaissance for anyone probing the host. It previously had no session check
 * at all, and also appended a synthetic "Debug: items=N" entry that reported backend
 * reachability to the caller — both removed.
 */
import { withAuth } from '../../../lib/api-auth.ts';

const FETCH_TIMEOUT_MS = Number(process.env.COOLIFY_FETCH_TIMEOUT_MS || 8000);

async function fetchJson(url: string, token: string): Promise<any[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      // Log the status only — the body can echo the token back.
      console.warn(`[coolify] ${url} responded ${response.status}`);
      return null;
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data?.data ?? []);
  } catch (err) {
    console.warn(`[coolify] ${url} unreachable:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiUrl = process.env.COOLIFY_API_URL;
  const apiToken = process.env.COOLIFY_API_TOKEN;
  if (!apiUrl || !apiToken || apiToken === 'your_coolify_bearer_token') {
    return res.status(200).json([]);
  }

  const [apps, services] = await Promise.all([
    fetchJson(`${apiUrl}/applications`, apiToken),
    fetchJson(`${apiUrl}/services`, apiToken),
  ]);

  const items = [...(apps ?? []), ...(services ?? [])];

  return res.status(200).json(
    items.map((app: any, index: number) => ({
      id: `coolify_app_${app.uuid || app.id || index}`,
      name: app.name || `Unnamed App ${index}`,
      status: app.status || 'unknown',
      projectName: app.environment?.project?.name || app.project?.name || 'Coolify Project',
      url: app.fqdn || '',
    }))
  );
}, { adminOnly: true });
