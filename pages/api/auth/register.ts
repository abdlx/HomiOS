/**
 * Invitation-based registration. A valid invite token is REQUIRED — open
 * registration stays closed (Coolify default for self-hosted instances).
 */
import { getDb, withTransaction } from '../../../lib/db.ts';
import { createSession, createUserWithPasswordHash, hashPassword } from '../../../lib/auth.ts';
import { buildAuthCookies } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';
import { validateEmail, validatePassword, ValidationError } from '../../../lib/validate.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { email, password, invite } = req.body || {};
    if (!invite) return res.status(400).json({ error: 'An invitation token is required' });

    const cleanEmail = validateEmail(email);
    validatePassword(password);

    const db = getDb();
    const inv = db.prepare(
      'SELECT * FROM team_invitations WHERE token = ? AND expires_at > CURRENT_TIMESTAMP'
    ).get(String(invite)) as any;
    if (!inv) return res.status(400).json({ error: 'Invalid or expired invitation' });
    if (String(inv.email).toLowerCase() !== cleanEmail) {
      return res.status(400).json({ error: 'Invitation was issued for a different email' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) return res.status(400).json({ error: 'User already exists — log in instead' });

    const passwordHash = await hashPassword(String(password));
    const userId = withTransaction((tx) => {
      // Invited users are never instance admins — only /api/auth/setup mints those,
      // and only for the very first account.
      const newUserId = createUserWithPasswordHash(tx, cleanEmail, passwordHash, { isAdmin: false });
      tx.prepare('INSERT INTO team_users (team_id, user_id, role) VALUES (?, ?, ?)')
        .run(inv.team_id, newUserId, inv.role);
      // Burn the invite inside the transaction so it cannot be redeemed twice.
      const consumed = tx.prepare('DELETE FROM team_invitations WHERE id = ?').run(inv.id);
      if (!consumed.changes) throw new Error('Invitation already used');
      return newUserId;
    });

    const sessionId = createSession(userId);
    logAudit({ teamId: inv.team_id, userId, action: 'auth.registered_via_invite' });
    res.setHeader('Set-Cookie', buildAuthCookies(sessionId, req));
    return res.json({ ok: true });
  } catch (err: any) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err?.message === 'Invitation already used') {
      return res.status(400).json({ error: 'Invalid or expired invitation' });
    }
    console.error('[/api/auth/register]', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
}
