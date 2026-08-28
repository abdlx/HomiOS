import fs from 'fs';
import path from 'path';
import { withAuth } from '../../../../lib/api-auth.ts';
import { getCatalogApp } from '../../../../lib/apps/catalog.ts';
import { refreshCoolifyCatalog } from '../../../../lib/apps/coolify-catalog.ts';

const COOLIFY_ICON_ORIGIN = 'https://raw.githubusercontent.com';
const COOLIFY_ICON_PREFIX = '/coollabsio/coolify/refs/heads/main/public/';
const CONTENT_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function localIconPath(iconUrl: URL) {
  const relative = iconUrl.pathname.slice(COOLIFY_ICON_PREFIX.length);
  const publicRoot = path.resolve(process.cwd(), 'coolify', 'public');
  const candidate = path.resolve(publicRoot, relative);
  return candidate.startsWith(`${publicRoot}${path.sep}`) ? candidate : null;
}

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();

  try { await refreshCoolifyCatalog(); } catch {}
  const app = getCatalogApp(String(req.query.id || ''));
  if (!app?.icon) return res.status(404).end();

  let iconUrl: URL;
  try { iconUrl = new URL(app.icon); } catch { return res.status(404).end(); }
  if (iconUrl.origin !== COOLIFY_ICON_ORIGIN || !iconUrl.pathname.startsWith(COOLIFY_ICON_PREFIX)) {
    return res.status(404).end();
  }

  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const localPath = localIconPath(iconUrl);
  if (localPath && fs.existsSync(localPath)) {
    const extension = path.extname(localPath).toLowerCase();
    const type = extension === '.svg' ? 'image/svg+xml' : extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : extension === '.gif' ? 'image/gif' : 'image/jpeg';
    res.setHeader('Content-Type', type);
    return res.send(fs.readFileSync(localPath));
  }

  try {
    const response = await fetch(iconUrl, { signal: AbortSignal.timeout(10_000) });
    const type = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!response.ok || !CONTENT_TYPES.has(type)) return res.status(404).end();
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1_000_000) return res.status(413).end();
    res.setHeader('Content-Type', type);
    return res.send(bytes);
  } catch {
    return res.status(404).end();
  }
});
