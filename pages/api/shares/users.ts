import { getDb, withTransaction } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import {
  setSambaPassword,
  removeSambaUser,
  toggleSambaUser,
  regenerateSmbConf,
} from '../../../lib/samba.ts';

function summarizeOsResult(result: { ok: boolean; error?: string }) {
  return result.ok ? { ok: true } : { ok: false, error: 'System account operation failed' };
}

export default withAuth(async function handler(req: any, res: any) {
  const db = getDb();

  try {
    if (req.method === 'GET') {
      const users = db.prepare(
        'SELECT id, username, enabled, created_at FROM samba_users ORDER BY username ASC'
      ).all() as any[];

      return res.json(users.map((user) => ({
        ...user,
        shares: db.prepare(`
          SELECT s.id, s.name, s.path, s.read_only
          FROM shares s
          JOIN share_users su ON su.share_id = s.id
          WHERE su.samba_user_id = ?
        `).all(user.id),
      })));
    }

    if (req.method === 'POST') {
      const { username, password, resetPassword, enabled } = req.body || {};
      if (!username) return res.status(400).json({ error: 'username is required' });
      if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be lowercase, start with a letter/underscore, max 32 chars' });
      }

      if (enabled !== undefined) {
        const user = db.prepare('SELECT * FROM samba_users WHERE username = ?').get(username) as any;
        if (!user) return res.status(404).json({ error: 'User not found' });
        const osResult = toggleSambaUser(username, !!enabled);
        if (!osResult.ok) return res.status(503).json({ error: osResult.error || 'Samba could not update this account' });
        withTransaction((tx) => {
          tx.prepare('UPDATE samba_users SET enabled = ? WHERE username = ?').run(!!enabled ? 1 : 0, username);
        });
        regenerateSmbConf(db);
        return res.json({ ok: true, osResult: summarizeOsResult(osResult) });
      }

      if (resetPassword) {
        if (!password) return res.status(400).json({ error: 'password is required' });
        const user = db.prepare('SELECT * FROM samba_users WHERE username = ?').get(username) as any;
        if (!user) return res.status(404).json({ error: 'User not found' });
        const osResult = setSambaPassword(username, password);
        if (!osResult.ok) return res.status(503).json({ error: osResult.error || 'Samba could not update this password' });
        return res.json({ ok: true, osResult: summarizeOsResult(osResult) });
      }

      if (!password) return res.status(400).json({ error: 'password is required for new users' });
      const existing = db.prepare('SELECT id FROM samba_users WHERE username = ?').get(username);
      if (existing) return res.status(409).json({ error: 'User already exists' });

      const osResult = setSambaPassword(username, password);
      if (!osResult.ok) return res.status(503).json({ error: osResult.error || 'Samba could not create this account' });
      const result = withTransaction((tx) => tx.prepare(
        'INSERT INTO samba_users (username, enabled) VALUES (?, 1)'
      ).run(username));

      return res.status(201).json({
        ok: true,
        id: result.lastInsertRowid,
        username,
        osResult: summarizeOsResult(osResult),
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const user = db.prepare('SELECT * FROM samba_users WHERE id = ?').get(id) as any;
      if (!user) return res.status(404).json({ error: 'User not found' });

      const osResult = removeSambaUser(user.username);
      if (!osResult.ok) return res.status(503).json({ error: osResult.error || 'Samba could not remove this account' });
      withTransaction((tx) => {
        tx.prepare('DELETE FROM samba_users WHERE id = ?').run(id);
      });
      regenerateSmbConf(db);
      return res.json({ ok: true, osResult: summarizeOsResult(osResult) });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    return res.status(405).end();
  } catch (err: any) {
    console.error('[/api/shares/users]', err);
    return res.status(500).json({ error: 'Samba user operation failed' });
  }
}, { adminOnly: true, ability: 'write' });
