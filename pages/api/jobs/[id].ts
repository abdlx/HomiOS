import { withAuth } from '../../../lib/api-auth.ts';
import { getJob, updateJobAction } from '../../../lib/jobs.ts';

export default withAuth(async (req: any, res: any) => {
  const id = String(req.query.id || '');
  if (!id) return res.status(400).json({ error: 'Missing job id' });

  if (req.method === 'GET') {
    const job = getJob(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json(job);
  }

  if (req.method === 'PATCH') {
    const action = req.body?.action;
    if (!['pause', 'resume', 'cancel', 'retry'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }
    try {
      return res.json(updateJobAction(id, action));
    } catch (err: any) {
      return res.status(404).json({ error: err.message });
    }
  }

  res.setHeader('Allow', ['GET', 'PATCH']);
  return res.status(405).end();
});
