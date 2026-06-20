/**
 * /api/teams
 * GET  — teams the current user belongs to (+ active team)
 * POST — create a new team (creator becomes owner)
 */
import crypto from 'crypto';
import { getDb } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';
import { withTransaction } from '../../../lib/db.ts';

export default withAuth(async (req, res, session) => {
  const db = getDb();

  if (req.method === 'GET') {
    const teams = db.prepare(`
      SELECT t.id, t.name, t.personal_team, tu.role,
        (SELECT COUNT(*) FROM team_users x WHERE x.team_id = t.id) AS member_count
      FROM teams t JOIN team_users tu ON tu.team_id = t.id
      WHERE tu.user_id = ?
      ORDER BY t.personal_team DESC, t.created_at ASC
    `).all(session.userId);
    return res.json({ activeTeamId: session.teamId, teams });
  }

  if (req.method === 'POST') {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
    const teamId = crypto.randomUUID();
    withTransaction((tx) => {
      tx.prepare('INSERT INTO teams (id, name, personal_team) VALUES (?, ?, 0)').run(teamId, String(name).trim());
      tx.prepare('INSERT INTO team_users (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, session.userId, 'owner');
      for (const ch of ['email', 'discord', 'slack', 'telegram', 'pushover', 'webhook']) {
        tx.prepare('INSERT OR IGNORE INTO notification_settings (team_id, channel, enabled, config) VALUES (?, ?, 0, ?)')
          .run(teamId, ch, '{}');
      }
    });
    logAudit({ teamId, userId: session.userId, action: 'team.created', meta: { name } });
    return res.status(201).json({ ok: true, id: teamId });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end();
});
