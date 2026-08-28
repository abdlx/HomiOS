import { withAuth } from '../../lib/api-auth.ts';
import { searchIndex } from '../../lib/indexer.ts';
import { listManagedApps } from '../../lib/apps/app-service.ts';

// The index spans the whole host filesystem, so searching it is admin-level read.
export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  const q = String(req.query.q || '');
  const type = String(req.query.type || 'all');
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const files = type === 'application' ? [] : await searchIndex(q, type, limit);
  const needle = q.trim().toLowerCase();
  const apps = type !== 'all' && type !== 'application' ? [] : listManagedApps()
    .filter((app) => app.name.toLowerCase().includes(needle) || app.catalogId.includes(needle))
    .map((app) => ({ id: `application:${app.id}`, kind: 'application', name: app.name, path: app.primaryUrl, snippet: app.status, score: -100 }));
  return res.json([...apps, ...files].slice(0, limit));
}, { adminOnly: true });
