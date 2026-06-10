/** GET /api/audit — recent audit log entries for the active team. */
import { withAuth } from '../../../lib/api-auth.ts';
import { listAudit } from '../../../lib/audit.ts';

export default withAuth(async (req, res, session) => {
  if (req.method !== 'GET') return res.status(405).end();
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  return res.json(listAudit(session.teamId, limit).map((r: any) => ({ ...r, meta: JSON.parse(r.meta || '{}') })));
});
