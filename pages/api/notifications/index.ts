import { withAuth } from '../../../lib/api-auth.ts';
import { listNotifications } from '../../../lib/notifications.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  return res.json(listNotifications(session.userId, session.teamId, Number(req.query.limit) || 50));
});
