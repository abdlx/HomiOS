/**
 * GET /api/audit                 — recent audit entries for the active team.
 * GET /api/audit?scope=instance  — full trail incl. instance-wide events (admins only).
 */
import { withAuth } from '../../../lib/api-auth.ts';
import { listAudit, listInstanceAudit } from '../../../lib/audit.ts';

export default withAuth(async (req, res, session) => {
  if (req.method !== 'GET') return res.status(405).end();

  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const wantsInstance = req.query.scope === 'instance';

  if (wantsInstance && !session.isAdmin) {
    return res.status(403).json({ error: 'Requires administrator privileges' });
  }

  const rows = wantsInstance ? listInstanceAudit(limit) : listAudit(session.teamId, limit);
  return res.json(rows.map((r: any) => ({ ...r, meta: JSON.parse(r.meta || '{}') })));
});
