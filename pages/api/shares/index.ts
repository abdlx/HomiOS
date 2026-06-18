import { getDb } from '../../../lib/db.ts';
import { getSession } from '../../../lib/auth.ts';
import { regenerateSmbConf } from '../../../lib/samba.ts';

/**
 * /api/shares
 *
 * GET    – list all shares owned by the current user, with their valid samba users
 * POST   – create a new share  { name, path, readOnly, comment, userIds? }
 * PATCH  – update a share      { id, name?, path?, readOnly?, comment?, userIds? }
 * DELETE – remove a share      { id }
 */
export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb(); // shared connection — schema guaranteed by lib/db.ts

  try {
    // ── GET ───────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const shares = db.prepare(
        'SELECT * FROM shares WHERE user_id = ? ORDER BY created_at DESC'
      ).all(session.userId) as any[];

      // Attach valid samba users for each share
      const enriched = shares.map((share) => {
        const users = db.prepare(`
          SELECT su.id, su.username, su.enabled, COALESCE(shu.access, 'write') as access
          FROM samba_users su
          JOIN share_users shu ON shu.samba_user_id = su.id
          WHERE shu.share_id = ?
        `).all(share.id);

        return { ...share, sambaUsers: users };
      });

      return res.json(enriched);
    }

    // ── POST ──────────────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const { name, path: sharePath, readOnly = false, comment = '', enabled = true, expiresAt = null, userIds = [], userAccess = [] } = req.body;

      if (!name || !sharePath) {
        return res.status(400).json({ error: 'name and path are required' });
      }

      // Sanitise share name: alphanumeric + hyphens/underscores only
      if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
        return res.status(400).json({ error: 'Share name must be alphanumeric (hyphens/underscores allowed)' });
      }

      const result = db.prepare(
        'INSERT INTO shares (user_id, name, path, read_only, comment, enabled, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(session.userId, name, sharePath, readOnly ? 1 : 0, comment, enabled ? 1 : 0, expiresAt || null);

      const shareId = result.lastInsertRowid;

      // Link samba users
      const accessRows = Array.isArray(userAccess) && userAccess.length > 0
        ? userAccess
        : (Array.isArray(userIds) ? userIds.map((uid: any) => ({ id: uid, access: readOnly ? 'read' : 'write' })) : []);
      if (accessRows.length > 0) {
        const linkStmt = db.prepare(
          'INSERT OR IGNORE INTO share_users (share_id, samba_user_id, access) VALUES (?, ?, ?)'
        );
        for (const row of accessRows) {
          linkStmt.run(shareId, row.id ?? row.userId ?? row, row.access === 'read' ? 'read' : 'write');
        }
      }

      regenerateSmbConf(db);

      return res.status(201).json({
        ok: true,
        id: shareId,
        uncPath: `\\\\server\\${name}`,
      });
    }

    // ── PATCH ─────────────────────────────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, name, path: sharePath, readOnly, comment, enabled, expiresAt, userIds, userAccess } = req.body;

      if (!id) return res.status(400).json({ error: 'id is required' });

      // Confirm this share belongs to the authenticated user
      const existing = db.prepare(
        'SELECT * FROM shares WHERE id = ? AND user_id = ?'
      ).get(id, session.userId) as any;

      if (!existing) return res.status(404).json({ error: 'Share not found' });

      // Build a partial update
      const updates: string[] = [];
      const values: any[] = [];

      if (name !== undefined) {
        if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
          return res.status(400).json({ error: 'Invalid share name' });
        }
        updates.push('name = ?'); values.push(name);
      }
      if (sharePath !== undefined) { updates.push('path = ?'); values.push(sharePath); }
      if (readOnly !== undefined) { updates.push('read_only = ?'); values.push(readOnly ? 1 : 0); }
      if (comment !== undefined) { updates.push('comment = ?'); values.push(comment); }
      if (enabled !== undefined) { updates.push('enabled = ?'); values.push(enabled ? 1 : 0); }
      if (expiresAt !== undefined) { updates.push('expires_at = ?'); values.push(expiresAt || null); }

      if (updates.length > 0) {
        values.push(id, session.userId);
        db.prepare(`UPDATE shares SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }

      // Replace share_users if userIds provided
      if (Array.isArray(userIds) || Array.isArray(userAccess)) {
        db.prepare('DELETE FROM share_users WHERE share_id = ?').run(id);
        const linkStmt = db.prepare(
          'INSERT OR IGNORE INTO share_users (share_id, samba_user_id, access) VALUES (?, ?, ?)'
        );
        const accessRows = Array.isArray(userAccess) && userAccess.length > 0
          ? userAccess
          : (Array.isArray(userIds) ? userIds.map((uid: any) => ({ id: uid, access: readOnly ? 'read' : 'write' })) : []);
        for (const row of accessRows) {
          linkStmt.run(id, row.id ?? row.userId ?? row, row.access === 'read' ? 'read' : 'write');
        }
      }

      regenerateSmbConf(db);

      return res.json({ ok: true });
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id } = req.body;

      if (!id) return res.status(400).json({ error: 'id is required' });

      const deleted = db.prepare(
        'DELETE FROM shares WHERE id = ? AND user_id = ?'
      ).run(id, session.userId);

      if (deleted.changes === 0) return res.status(404).json({ error: 'Share not found' });

      // share_users cascade deletes due to FK ON DELETE CASCADE
      regenerateSmbConf(db);

      return res.json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).end();
  } catch (err: any) {
    console.error('[/api/shares]', err);
    return res.status(500).json({ error: err.message });
  }
}
