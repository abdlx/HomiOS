/**
 * /api/teams/[id]/members
 * GET    — list members + pending invitations
 * POST   — invite by email { email, role } (admin+). If the user exists they're added directly.
 * PATCH  — change role { userId, role } (owner only)
 * DELETE — remove member { userId } (admin+; owners can't be removed by non-owners)
 */
import crypto from 'crypto';
import { getDb } from '../../../../lib/db.ts';
import { withAuth, roleAtLeast } from '../../../../lib/api-auth.ts';
import { roleInTeam } from '../../../../lib/auth.ts';
import { logAudit } from '../../../../lib/audit.ts';

const VALID_ROLES = ['member', 'admin', 'owner'];

export default withAuth(async (req, res, session) => {
  const db = getDb();
  const teamId = String(req.query.id);

  const myRole = roleInTeam(session.userId, teamId);
  if (!myRole) return res.status(404).json({ error: 'Team not found' });

  if (req.method === 'GET') {
    const members = db.prepare(`
      SELECT u.id, u.email, tu.role FROM team_users tu JOIN users u ON u.id = tu.user_id
      WHERE tu.team_id = ?
      ORDER BY CASE tu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
    `).all(teamId);
    const invitations = db.prepare(
      'SELECT id, email, role, expires_at FROM team_invitations WHERE team_id = ? AND expires_at > CURRENT_TIMESTAMP'
    ).all(teamId);
    return res.json({ members, invitations, myRole });
  }

  if (req.method === 'POST') {
    if (!roleAtLeast(myRole, 'admin')) return res.status(403).json({ error: 'Requires admin role' });
    const { email, role = 'member' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });
    if (!VALID_ROLES.includes(role) || role === 'owner') return res.status(400).json({ error: 'Invalid role' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email)) as any;
    if (existing) {
      db.prepare('INSERT OR IGNORE INTO team_users (team_id, user_id, role) VALUES (?, ?, ?)')
        .run(teamId, existing.id, role);
      logAudit({ teamId, userId: session.userId, action: 'team.member_added', meta: { email, role } });
      return res.status(201).json({ ok: true, added: true });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    db.prepare('INSERT INTO team_invitations (id, team_id, email, role, token, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), teamId, String(email), role, token, expiresAt);
    logAudit({ teamId, userId: session.userId, action: 'team.invited', meta: { email, role } });
    return res.status(201).json({ ok: true, invited: true, inviteLink: `/register?invite=${token}` });
  }

  if (req.method === 'PATCH') {
    if (myRole !== 'owner') return res.status(403).json({ error: 'Requires owner role' });
    const { userId, role } = req.body || {};
    if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    db.prepare('UPDATE team_users SET role = ? WHERE team_id = ? AND user_id = ?').run(role, teamId, userId);
    logAudit({ teamId, userId: session.userId, action: 'team.role_changed', meta: { targetUserId: userId, role } });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (!roleAtLeast(myRole, 'admin')) return res.status(403).json({ error: 'Requires admin role' });
    const { userId, invitationId } = req.body || {};
    if (invitationId) {
      db.prepare('DELETE FROM team_invitations WHERE id = ? AND team_id = ?').run(invitationId, teamId);
      return res.json({ ok: true });
    }
    const targetRole = roleInTeam(Number(userId), teamId);
    if (targetRole === 'owner' && myRole !== 'owner') {
      return res.status(403).json({ error: 'Only an owner can remove an owner' });
    }
    db.prepare('DELETE FROM team_users WHERE team_id = ? AND user_id = ?').run(teamId, userId);
    logAudit({ teamId, userId: session.userId, action: 'team.member_removed', meta: { targetUserId: userId } });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
  return res.status(405).end();
});
