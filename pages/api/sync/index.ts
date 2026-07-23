import { withAuth } from '../../../lib/api-auth.ts';
import { enqueueJob } from '../../../lib/jobs.ts';
import {
  createSyncPlan,
  getSyncPlan,
  hasActiveSyncRun,
  canAccessPlan,
  listSyncPlans,
  listSyncRuns,
} from '../../../lib/sync.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method === 'GET') {
    const plans = listSyncPlans(session.teamId, session.userId);
    return res.json({
      plans: plans.map((plan) => ({ ...plan, running: hasActiveSyncRun(plan.id) })),
      runs: listSyncRuns({ planIds: plans.map((plan) => plan.id), limit: Number(req.query.limit) || 25 }),
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};

    if (body.action === 'run') {
      const plan = getSyncPlan(String(body.planId || ''));
      if (!plan || !canAccessPlan(plan, session)) return res.status(404).json({ error: 'Sync plan not found' });
      if (hasActiveSyncRun(plan.id)) return res.status(409).json({ error: 'This plan is already syncing' });
      const id = enqueueJob({
        type: 'sync.run',
        name: `Backup sync: ${plan.name}`,
        payload: { planId: plan.id },
        teamId: session.teamId,
        userId: session.userId,
        priority: 10,
      });
      return res.status(202).json({ ok: true, jobId: id });
    }

    try {
      const id = createSyncPlan({
        teamId: session.teamId,
        userId: session.userId,
        name: body.name,
        sources: body.sources,
        destinations: body.destinations,
        mirrorDeletes: body.mirrorDeletes,
        schedule: body.schedule,
        enabled: body.enabled,
      });
      return res.status(201).json({ ok: true, id, plan: getSyncPlan(id) });
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Could not create sync plan' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end();
}, { adminOnly: true, ability: 'write' });
