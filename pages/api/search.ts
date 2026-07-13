import { withAuth } from '../../lib/api-auth.ts';
import { searchIndex } from '../../lib/indexer.ts';

// The index spans the whole host filesystem, so searching it is admin-level read.
export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  const q = String(req.query.q || '');
  const type = String(req.query.type || 'all');
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  return res.json(await searchIndex(q, type, limit));
}, { adminOnly: true });
