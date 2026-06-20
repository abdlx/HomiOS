import { withAuth } from '../../../lib/api-auth.ts';
import { clearReadNotifications, createNotification, listNotifications, markAllNotificationsRead } from '../../../lib/notifications.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method === 'GET') {
    const filter = typeof req.query.filter === 'string' ? req.query.filter : 'all';
    return res.json(listNotifications(session.userId, session.teamId, Number(req.query.limit) || 50, filter as any));
  }

  if (req.method === 'PATCH') {
    const filter = typeof req.body?.filter === 'string' ? req.body.filter : 'all';
    markAllNotificationsRead(session.userId, session.teamId, filter as any);
    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    const { title, message, tone, sourceType, sourceId } = req.body || {};
    if (!title || !message) return res.status(400).json({ error: 'title and message are required' });
    const id = createNotification({
      userId: session.userId,
      teamId: session.teamId,
      title,
      message,
      tone,
      sourceType,
      sourceId,
    });
    return res.status(201).json({ ok: true, id });
  }

  if (req.method === 'DELETE') {
    clearReadNotifications(session.userId, session.teamId);
    return res.json({ ok: true });
  }

  return res.status(405).end();
});
