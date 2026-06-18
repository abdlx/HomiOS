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

export function listNotifications(userId: number, teamId: string, limit = 50) {
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
    WHERE (user_id = ? OR team_id = ? OR (user_id IS NULL AND team_id IS NULL))
    ORDER BY created_at DESC
    LIMIT ?
  `).all(userId, teamId, Math.min(Math.max(1, limit), 100));
}

export function markNotificationRead(id: number, userId: number, read = true) {
  return getDb().prepare(`
    UPDATE notifications
    SET read_at = ${read ? 'CURRENT_TIMESTAMP' : 'NULL'}
    WHERE id = ? AND (user_id = ? OR user_id IS NULL)
  `).run(id, userId);
}
