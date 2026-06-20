import { withAuth } from '../../../lib/api-auth.ts';
import { deleteNotification, markNotificationRead } from '../../../lib/notifications.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  const id = Number(req.query.id);
  if (!id) return res.status(400).json({ error: 'Missing notification id' });

  if (req.method === 'PATCH') {
    markNotificationRead(id, session.userId, req.body?.read !== false);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    deleteNotification(id, session.userId);
    return res.json({ ok: true });
  }

  return res.status(405).end();
});
