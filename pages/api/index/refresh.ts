import { withAuth } from '../../../lib/api-auth.ts';
import { enqueueJob } from '../../../lib/jobs.ts';
import { getIndexState } from '../../../lib/indexer.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method === 'GET') {
    return res.json(getIndexState());
  }

  if (req.method === 'POST') {
    const scope = req.body?.scope === 'photos' ? 'photos' : 'files';
    const id = enqueueJob({
      type: scope === 'photos' ? 'index.photos' : 'index.files',
      name: scope === 'photos' ? 'Refresh Photos Index' : 'Refresh File Index',
      payload: { rootPath: req.body?.rootPath || '' },
      teamId: session.teamId,
      userId: session.userId,
      priority: 5,
    });
    return res.status(202).json({ ok: true, id });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end();
});
