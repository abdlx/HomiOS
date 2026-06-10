/**
 * Audit trail — every security-relevant action lands in audit_logs.
 * Mirrors Coolify's Spatie activity log, scoped per team.
 */
import { getDb } from './db.ts';

export function logAudit(entry: {
  teamId?: string | null;
  userId?: number | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  meta?: Record<string, any>;
}): void {
  try {
    getDb().prepare(`
      INSERT INTO audit_logs (team_id, user_id, action, resource_type, resource_id, meta)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      entry.teamId ?? null,
      entry.userId ?? null,
      entry.action,
      entry.resourceType ?? null,
      entry.resourceId ?? null,
      JSON.stringify(entry.meta ?? {}),
    );
  } catch {
    // Auditing must never break the action being audited.
  }
}

export function listAudit(teamId: string, limit = 200): any[] {
  return getDb().prepare(`
    SELECT a.*, u.email AS user_email
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.team_id = ? OR a.team_id IS NULL
    ORDER BY a.created_at DESC LIMIT ?
  `).all(teamId, limit);
}
