import { withAuth } from '../../../lib/api-auth.ts';
import { listCatalog } from '../../../lib/apps/catalog.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  return res.json({ apps: listCatalog() });
});
