import { withAuth } from '../../../lib/api-auth.ts';
import { listFullCatalog } from '../../../lib/apps/catalog.ts';
import { refreshCoolifyCatalog } from '../../../lib/apps/coolify-catalog.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  let catalogAvailable = true;
  try { await refreshCoolifyCatalog(); } catch { catalogAvailable = false; }
  return res.json({ apps: listFullCatalog(), catalogAvailable });
});
