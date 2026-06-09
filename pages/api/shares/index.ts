import Database from 'better-sqlite3';
import { getSession } from '../../../lib/auth';
import { DB_PATH, bootstrapSambaSchema, regenerateSmbConf } from '../../../lib/samba';

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

  const db = new Database(DB_PATH);
  bootstrapSambaSchema(db);

  try {
    // ── GET ───────────────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      const shares = db.prepare(
        'SELECT * FROM shares WHERE user_id = ? ORDER BY created_at DESC'
      ).all(session.userId) as any[];

      // Attach valid samba users for each share
      const enriched = shares.map((share) => {
        const users = db.prepare(`
          SELECT su.id, su.username, su.enabled
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
      const { name, path: sharePath, readOnly = false, comment = '', userIds = [] } = req.body;

      if (!name || !sharePath) {
        return res.status(400).json({ error: 'name and path are required' });
      }

      // Sanitise share name: alphanumeric + hyphens/underscores only
      if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
        return res.status(400).json({ error: 'Share name must be alphanumeric (hyphens/underscores allowed)' });
      }

      const result = db.prepare(
        'INSERT INTO shares (user_id, name, path, read_only, comment) VALUES (?, ?, ?, ?, ?)'
      ).run(session.userId, name, sharePath, readOnly ? 1 : 0, comment);

      const shareId = result.lastInsertRowid;

      // Link samba users
      if (Array.isArray(userIds) && userIds.length > 0) {
        const linkStmt = db.prepare(
          'INSERT OR IGNORE INTO share_users (share_id, samba_user_id) VALUES (?, ?)'
        );
        for (const uid of userIds) {
          linkStmt.run(shareId, uid);
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
      const { id, name, path: sharePath, readOnly, comment, userIds } = req.body;

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

      if (updates.length > 0) {
        values.push(id, session.userId);
        db.prepare(`UPDATE shares SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);
      }

      // Replace share_users if userIds provided
      if (Array.isArray(userIds)) {
        db.prepare('DELETE FROM share_users WHERE share_id = ?').run(id);
        const linkStmt = db.prepare(
          'INSERT OR IGNORE INTO share_users (share_id, samba_user_id) VALUES (?, ?)'
        );
        for (const uid of userIds) {
          linkStmt.run(id, uid);
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
