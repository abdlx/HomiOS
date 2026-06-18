import { withAuth } from '../../../../lib/api-auth.ts';
import { listJobEvents } from '../../../../lib/jobs.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  const id = String(req.query.id || '');
  if (!id) return res.status(400).json({ error: 'Missing job id' });
  return res.json(listJobEvents(id, Number(req.query.limit) || 200));
});
