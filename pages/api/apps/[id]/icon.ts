import { withAuth } from '../../../../lib/api-auth.ts';
import { getCatalogApp } from '../../../../lib/apps/catalog.ts';
import { CODE_SERVER_ICON_URL, ensureIconCached, readCachedIcon } from '../../../../lib/apps/icon-cache.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();

  const id = String(req.query.id || '');
  const app = getCatalogApp(id);
  const iconUrl = id === 'code-server' ? CODE_SERVER_ICON_URL : app?.icon;
  if (!iconUrl) return res.status(404).end();

  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'");
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const icon = readCachedIcon(iconUrl) || await ensureIconCached(iconUrl);
  if (!icon) return res.status(404).end();
  res.setHeader('Content-Type', icon.contentType);
  return res.send(icon.bytes);
});
