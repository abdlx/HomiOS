import { getApp } from '../../../../../lib/docker-db.ts';
import { withAuth } from '../../../../../lib/api-auth.ts';
import { listBackups, backupApp } from '../../../../../lib/deploy-engine.ts';

export default withAuth(async (req: any, res: any) => {
  const { id } = req.query;
  if (!getApp(id)) return res.status(404).json({ error: 'App not found' });
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await listBackups(id));
    }
    if (req.method === 'POST') {
      const result = await backupApp(id);
      if (!result.ok) return res.status(400).json(result);
      return res.status(201).json(result);
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end();
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
