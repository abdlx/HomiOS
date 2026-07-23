import { withAuth } from '../../../lib/api-auth.ts';
import { canAccessPlan, deleteSyncPlan, getSyncPlan, updateSyncPlan } from '../../../lib/sync.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  const plan = getSyncPlan(String(req.query.id || ''));
  if (!plan || !canAccessPlan(plan, session)) return res.status(404).json({ error: 'Sync plan not found' });

  if (req.method === 'GET') return res.json(plan);

  if (req.method === 'PATCH') {
    try {
      return res.json({ ok: true, plan: updateSyncPlan(plan.id, req.body || {}) });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Could not update sync plan' });
    }
  }

  if (req.method === 'DELETE') {
    deleteSyncPlan(plan.id);
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
  return res.status(405).end();
}, { adminOnly: true, ability: 'write' });
