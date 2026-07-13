import { withAuth } from '../../../lib/api-auth.ts';
import { createBackupPlan, listBackupPlans, listBackupRuns } from '../../../lib/backups.ts';
import { enqueueJob } from '../../../lib/jobs.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method === 'GET') {
    return res.json({
      plans: listBackupPlans(session.teamId, session.userId),
      runs: listBackupRuns(session.teamId, session.userId, Number(req.query.limit) || 50),
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    if (body.action === 'run') {
      const id = enqueueJob({
        type: 'backup.run',
        name: body.planId ? 'Run Backup Plan' : 'Manual Backup',
        payload: {
          planId: body.planId,
          sourcePath: body.sourcePath,
          destinationType: body.destinationType,
          destination: body.destination,
        },
        teamId: session.teamId,
        userId: session.userId,
        priority: 10,
      });
      return res.status(202).json({ ok: true, id });
    }

    if (body.action === 'restore') {
      const id = enqueueJob({
        type: 'backup.restore',
        name: 'Restore Backup',
        payload: { runId: body.runId, targetPath: body.targetPath },
        teamId: session.teamId,
        userId: session.userId,
        priority: 10,
      });
      return res.status(202).json({ ok: true, id });
    }

    const { name, sourcePath, destinationType, destination, schedule } = body;
    if (!name || !sourcePath || !destinationType || !destination) {
      return res.status(400).json({ error: 'name, sourcePath, destinationType and destination are required' });
    }
    const id = createBackupPlan({
      teamId: session.teamId,
      userId: session.userId,
      name,
      sourcePath,
      destinationType,
      destination,
      schedule,
    });
    return res.status(201).json({ ok: true, id });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end();
}, { adminOnly: true, ability: 'write' });
