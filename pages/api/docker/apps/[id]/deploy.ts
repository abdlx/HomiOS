import { getApp } from '../../../../../lib/docker-db.ts';
import { withAuth } from '../../../../../lib/api-auth.ts';
import { enqueueDeploy } from '../../../../../lib/deploy-engine.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }
  const { id } = req.query;
  if (!getApp(id)) return res.status(404).json({ error: 'App not found' });
  try {
    const deploymentId = enqueueDeploy(id);
    return res.status(202).json({ deploymentId, status: 'queued' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
