import { withAuth } from '../../../lib/api-auth.ts';
import { listFullCatalog } from '../../../lib/apps/catalog.ts';
import { getCachedCoolifyCatalog, refreshCoolifyCatalog } from '../../../lib/apps/coolify-catalog.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  let catalogAvailable = true;
  const explicitRefresh = req.query.refresh === '1';
  const coldCache = getCachedCoolifyCatalog().length === 0;
  if (explicitRefresh || coldCache) {
    try { await refreshCoolifyCatalog(explicitRefresh); } catch { catalogAvailable = false; }
  }
  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
  return res.json({ apps: listFullCatalog(), catalogAvailable });
});
