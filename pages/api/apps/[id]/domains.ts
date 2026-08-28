import { withAuth } from '../../../../lib/api-auth.ts';
import { getAppDomains, updateAppDomains } from '../../../../lib/apps/app-service.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  const id = String(req.query.id || '');
  try {
    if (req.method === 'GET') return res.json({ routes: await getAppDomains(id) });
    if (req.method === 'PATCH') {
      return res.json(await updateAppDomains(id, req.body?.routes || [], !!req.body?.force, { teamId: session.teamId, userId: session.userId }));
    }
    return res.status(405).end();
  } catch (error: any) {
    const status = Number(error?.status) || (/not found|not managed/i.test(error?.message || '') ? 404 : 400);
    return res.status(status).json({ error: error?.message || 'Could not update app addresses', conflicts: error?.body?.conflicts });
  }
}, { adminOnly: true, ability: 'write' });
