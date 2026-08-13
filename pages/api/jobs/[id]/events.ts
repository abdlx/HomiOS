import { withAuth } from '../../../../lib/api-auth.ts';
import { canAccessJob, getJob, listJobEvents } from '../../../../lib/jobs.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  const id = String(req.query.id || '');
  if (!id) return res.status(400).json({ error: 'Missing job id' });
  const job = getJob(id);
  if (!job || !canAccessJob(job, session)) return res.status(404).json({ error: 'Job not found' });
  return res.json(listJobEvents(id, Number(req.query.limit) || 200));
});
