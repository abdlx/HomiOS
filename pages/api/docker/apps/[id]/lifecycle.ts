import { getApp } from '../../../../../lib/docker-db.ts';
import { withAuth } from '../../../../../lib/api-auth.ts';
import { startApp, stopApp, restartApp, rollbackApp, enqueueDeploy } from '../../../../../lib/deploy-engine.ts';

const ACTIONS = ['start', 'stop', 'restart', 'redeploy', 'rollback'];

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }
  const { id } = req.query;
  const action = String(req.body?.action || '');
  if (!ACTIONS.includes(action)) return res.status(400).json({ error: `Unknown action "${action}"` });
  if (!getApp(id)) return res.status(404).json({ error: 'App not found' });

  try {
    if (action === 'redeploy') return res.status(202).json({ deploymentId: enqueueDeploy(id), status: 'queued' });
    if (action === 'rollback') return res.status(202).json({ deploymentId: rollbackApp(id), status: 'queued' });
    if (action === 'start') await startApp(id);
    if (action === 'stop') await stopApp(id);
    if (action === 'restart') await restartApp(id);
    return res.status(200).json({ ok: true, action });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
