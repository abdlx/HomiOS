/**
 * Invitation-based registration. A valid invite token is REQUIRED — open
 * registration stays closed (Coolify default for self-hosted instances).
 */
import { getDb } from '../../../lib/db.ts';
import { createSession, createUserWithPasswordHash, hashPassword } from '../../../lib/auth.ts';
import { buildAuthCookies } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';
import { withTransaction } from '../../../lib/db.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { email, password, invite } = req.body || {};
    if (!email || !password || !invite) {
      return res.status(400).json({ error: 'email, password and invite token are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const db = getDb();
    const inv = db.prepare(
      'SELECT * FROM team_invitations WHERE token = ? AND expires_at > CURRENT_TIMESTAMP'
    ).get(String(invite)) as any;
    if (!inv) return res.status(400).json({ error: 'Invalid or expired invitation' });
    if (inv.email.toLowerCase() !== String(email).toLowerCase()) {
      return res.status(400).json({ error: 'Invitation was issued for a different email' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email));
    if (existing) return res.status(400).json({ error: 'User already exists — log in instead' });

    const passwordHash = await hashPassword(String(password));
    const userId = withTransaction((tx) => {
      const newUserId = createUserWithPasswordHash(tx, String(email), passwordHash);
      tx.prepare('INSERT INTO team_users (team_id, user_id, role) VALUES (?, ?, ?)')
        .run(inv.team_id, newUserId, inv.role);
      tx.prepare('DELETE FROM team_invitations WHERE id = ?').run(inv.id);
      return newUserId;
    });

    const sessionId = createSession(userId);
    logAudit({ teamId: inv.team_id, userId, action: 'auth.registered_via_invite' });
    res.setHeader('Set-Cookie', buildAuthCookies(sessionId));
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/auth/register]', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
}
