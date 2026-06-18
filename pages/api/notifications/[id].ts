import { withAuth } from '../../../lib/api-auth.ts';
import { markNotificationRead } from '../../../lib/notifications.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method !== 'PATCH') return res.status(405).end();
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Missing notification id' });
  markNotificationRead(id, session.userId, req.body?.read !== false);
  return res.json({ ok: true });
});
