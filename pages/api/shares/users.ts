import { getDb } from '../../../lib/db.ts';
import { getSession } from '../../../lib/auth.ts';
import {
  setSambaPassword,
  removeSambaUser,
  toggleSambaUser,
  regenerateSmbConf,
} from '../../../lib/samba.ts';

/**
 * /api/shares/users
 *
 * GET    – list all samba users (with the shares they are linked to)
 * POST   – create a samba user  { username, password }
 *          OR reset password     { username, password, resetPassword: true }
 *          OR toggle enabled     { username, enabled: boolean }
 * DELETE – remove a samba user  { id }
 */
export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb(); // shared connection — schema guaranteed by lib/db.ts

  try {
    // ── GET ───────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const users = db.prepare(
        'SELECT id, username, enabled, created_at FROM samba_users ORDER BY username ASC'
      ).all() as any[];

      // For each user, attach the list of share names they have access to
      const enriched = users.map((user) => {
        const shares = db.prepare(`
          SELECT s.id, s.name, s.path, s.read_only
          FROM shares s
          JOIN share_users su ON su.share_id = s.id
          WHERE su.samba_user_id = ?
        `).all(user.id);

        return { ...user, shares };
      });

      return res.json(enriched);
    }

    // ── POST ──────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { username, password, resetPassword, enabled } = req.body;

      if (!username) return res.status(400).json({ error: 'username is required' });

      // Sanitise username
      if (!/^[a-z_][a-z0-9_\-]{0,31}$/.test(username)) {
        return res.status(400).json({
          error: 'Username must be lowercase, start with a letter/underscore, max 32 chars',
        });
      }

      // ── Toggle enabled state ─────────────────────────────────────────────
      if (enabled !== undefined) {
        const user = db.prepare('SELECT * FROM samba_users WHERE username = ?').get(username) as any;
        if (!user) return res.status(404).json({ error: 'User not found' });

        const osResult = toggleSambaUser(username, !!enabled);
        // Don't fail the request if smbpasswd isn't available (dev env)
        db.prepare('UPDATE samba_users SET enabled = ? WHERE username = ?').run(!!enabled ? 1 : 0, username);

        // Refresh smb.conf so this user's access is immediately reflected
        regenerateSmbConf(db);

        return res.json({ ok: true, osResult });
      }

      // ── Reset / set password for existing user ───────────────────────────
      if (resetPassword) {
        if (!password) return res.status(400).json({ error: 'password is required' });
        const user = db.prepare('SELECT * FROM samba_users WHERE username = ?').get(username) as any;
        if (!user) return res.status(404).json({ error: 'User not found' });

        const osResult = setSambaPassword(username, password);
        return res.json({ ok: osResult.ok, osResult });
      }

      // ── Create new user ──────────────────────────────────────────────────
      if (!password) return res.status(400).json({ error: 'password is required for new users' });

      const existing = db.prepare('SELECT id FROM samba_users WHERE username = ?').get(username);
      if (existing) return res.status(409).json({ error: 'User already exists' });

      // Try to register in samba passdb (will gracefully fail in non-Linux envs)
      const osResult = setSambaPassword(username, password);

      const result = db.prepare(
        'INSERT INTO samba_users (username, enabled) VALUES (?, 1)'
      ).run(username);

      return res.status(201).json({
        ok: true,
        id: result.lastInsertRowid,
        username,
        osResult,
      });
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id is required' });

      const user = db.prepare('SELECT * FROM samba_users WHERE id = ?').get(id) as any;
      if (!user) return res.status(404).json({ error: 'User not found' });

      // Remove from samba passdb
      const osResult = removeSambaUser(user.username);

      // Remove from DB (share_users rows cascade-delete)
      db.prepare('DELETE FROM samba_users WHERE id = ?').run(id);

      // Regenerate smb.conf to remove this user from all valid users lists
      regenerateSmbConf(db);

      return res.json({ ok: true, osResult });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).end();
  } catch (err: any) {
    console.error('[/api/shares/users]', err);
    return res.status(500).json({ error: err.message });
  }
}
