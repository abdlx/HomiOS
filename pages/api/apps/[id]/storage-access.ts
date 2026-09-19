import { withAuth } from '../../../../lib/api-auth.ts';
import { setAppAllStorageAccess } from '../../../../lib/apps/app-service.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method !== 'PATCH') return res.status(405).end();
  if (typeof req.body?.accessAllMounts !== 'boolean') {
    return res.status(400).json({ error: 'accessAllMounts must be true or false' });
  }
  try {
    const app = await setAppAllStorageAccess(String(req.query.id || ''), req.body?.accessAllMounts === true, {
      teamId: session.teamId,
      userId: session.userId,
    });
    return res.json({ app });
  } catch (error: any) {
    const status = /not found|not managed/i.test(error?.message || '') ? 404 : 400;
    return res.status(status).json({ error: error?.message || 'Could not update storage access' });
  }
}, { adminOnly: true, ability: 'deploy' });
