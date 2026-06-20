import { getDb } from './db.ts';

export type NotificationTone = 'info' | 'success' | 'warning' | 'danger';

export function createNotification(input: {
  teamId?: string | null;
  userId?: number | null;
  title: string;
  message: string;
  tone?: NotificationTone;
  sourceType?: string;
  sourceId?: string;
}) {
  const result = getDb().prepare(`
    INSERT INTO notifications (team_id, user_id, title, message, tone, source_type, source_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.teamId || null,
    input.userId || null,
    input.title,
    input.message,
    input.tone || 'info',
    input.sourceType || null,
    input.sourceId || null
  );
  return result.lastInsertRowid;
}

export type NotificationFilter = 'all' | 'unread' | 'activity' | 'transfers' | 'system';

export function listNotifications(userId: number, teamId: string, limit = 50, filter: NotificationFilter = 'all') {
  const where = ['(user_id = ? OR team_id = ? OR (user_id IS NULL AND team_id IS NULL))'];
  const values: any[] = [userId, teamId];

  if (filter === 'unread') where.push('read_at IS NULL');
  if (filter === 'activity') where.push("(source_type = 'job' OR source_type = 'activity')");
  if (filter === 'transfers') where.push("source_type = 'transfer'");
  if (filter === 'system') where.push("(source_type = 'system' OR source_type IS NULL)");

  values.push(Math.min(Math.max(1, limit), 100));

  return getDb().prepare(`
    SELECT
      id,
      team_id as teamId,
      user_id as userId,
      title,
      message,
      tone,
      source_type as sourceType,
      source_id as sourceId,
      read_at as readAt,
      created_at as createdAt
    FROM notifications
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...values);
}

export function markNotificationRead(id: number, userId: number, read = true) {
  return getDb().prepare(`
    UPDATE notifications
    SET read_at = ${read ? 'CURRENT_TIMESTAMP' : 'NULL'}
    WHERE id = ? AND (user_id = ? OR user_id IS NULL)
  `).run(id, userId);
}

export function markAllNotificationsRead(userId: number, teamId: string, filter: NotificationFilter = 'all') {
  const where = ['(user_id = ? OR team_id = ? OR (user_id IS NULL AND team_id IS NULL))'];
  const values: any[] = [userId, teamId];

  if (filter === 'unread') where.push('read_at IS NULL');
  if (filter === 'activity') where.push("(source_type = 'job' OR source_type = 'activity')");
  if (filter === 'transfers') where.push("source_type = 'transfer'");
  if (filter === 'system') where.push("(source_type = 'system' OR source_type IS NULL)");

  return getDb().prepare(`
    UPDATE notifications
    SET read_at = CURRENT_TIMESTAMP
    WHERE ${where.join(' AND ')}
  `).run(...values);
}

export function deleteNotification(id: number, userId: number) {
  return getDb().prepare(`
    DELETE FROM notifications
    WHERE id = ? AND (user_id = ? OR user_id IS NULL)
  `).run(id, userId);
}

export function clearReadNotifications(userId: number, teamId: string) {
  return getDb().prepare(`
    DELETE FROM notifications
    WHERE read_at IS NOT NULL AND (user_id = ? OR team_id = ? OR (user_id IS NULL AND team_id IS NULL))
  `).run(userId, teamId);
}
