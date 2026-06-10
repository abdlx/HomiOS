import { getApp, getDeploymentsByApp } from '../../../../../lib/docker-db.ts';
import { withAuth } from '../../../../../lib/api-auth.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end();
  }
  const { id } = req.query;
  if (!getApp(id)) return res.status(404).json({ error: 'App not found' });
  return res.status(200).json(getDeploymentsByApp(id));
});
