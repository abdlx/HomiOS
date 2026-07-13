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

/**
 * Team-scoped audit trail.
 *
 * The `OR a.team_id IS NULL` clause that used to be here leaked every instance-wide
 * event (setup, failed logins, and their emails/IPs) into *every* team's audit view.
 * Instance-wide entries are admin-only — see listInstanceAudit.
 */
export function listAudit(teamId: string, limit = 200): any[] {
  return getDb().prepare(`
    SELECT a.*, u.email AS user_email
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    WHERE a.team_id = ?
    ORDER BY a.created_at DESC LIMIT ?
  `).all(teamId, Math.min(1000, Math.max(1, limit)));
}

/** Full audit trail including instance-wide (team_id IS NULL) events. Admins only. */
export function listInstanceAudit(limit = 200): any[] {
  return getDb().prepare(`
    SELECT a.*, u.email AS user_email
    FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.created_at DESC LIMIT ?
  `).all(Math.min(1000, Math.max(1, limit)));
}
