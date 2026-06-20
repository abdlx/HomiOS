import fs from 'fs';
import { getDb, buildAllowedUpdate, withTransaction } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { regenerateSmbConf } from '../../../lib/samba.ts';
import { resolveWithinRoot, sanitizeSambaText, validateSambaShareName } from '../../../lib/safe-paths.ts';

function normalizeAccessRows(userIds: any[], userAccess: any[], readOnly: boolean) {
  return Array.isArray(userAccess) && userAccess.length > 0
    ? userAccess
    : (Array.isArray(userIds) ? userIds.map((uid: any) => ({ id: uid, access: readOnly ? 'read' : 'write' })) : []);
}

export default withAuth(async function handler(req: any, res: any, session: any) {
  const db = getDb();

  try {
    if (req.method === 'GET') {
      const shares = db.prepare(
        'SELECT * FROM shares WHERE user_id = ? ORDER BY created_at DESC'
      ).all(session.userId) as any[];

      return res.json(shares.map((share) => ({
        ...share,
        sambaUsers: db.prepare(`
          SELECT su.id, su.username, su.enabled, COALESCE(shu.access, 'write') as access
          FROM samba_users su
          JOIN share_users shu ON shu.samba_user_id = su.id
          WHERE shu.share_id = ?
        `).all(share.id),
      })));
    }

    if (req.method === 'POST') {
      const {
        name,
        path: rawSharePath,
        readOnly = false,
        comment = '',
        enabled = true,
        expiresAt = null,
        userIds = [],
        userAccess = [],
      } = req.body || {};
      if (!name || !rawSharePath) return res.status(400).json({ error: 'name and path are required' });

      const safeName = validateSambaShareName(name);
      const sharePath = resolveWithinRoot(rawSharePath);
      const safeComment = sanitizeSambaText(comment);
      if (!fs.existsSync(sharePath)) fs.mkdirSync(sharePath, { recursive: true });

      const shareId = withTransaction((tx) => {
        const result = tx.prepare(
          'INSERT INTO shares (user_id, name, path, read_only, comment, enabled, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(session.userId, safeName, sharePath, readOnly ? 1 : 0, safeComment, enabled ? 1 : 0, expiresAt || null);

        const linkStmt = tx.prepare(
          'INSERT OR IGNORE INTO share_users (share_id, samba_user_id, access) VALUES (?, ?, ?)'
        );
        for (const row of normalizeAccessRows(userIds, userAccess, readOnly)) {
          linkStmt.run(result.lastInsertRowid, row.id ?? row.userId ?? row, row.access === 'read' ? 'read' : 'write');
        }
        return result.lastInsertRowid;
      });

      regenerateSmbConf(db);
      return res.status(201).json({ ok: true, id: shareId, uncPath: `\\\\server\\${safeName}` });
    }

    if (req.method === 'PATCH') {
      const { id, name, path: rawSharePath, readOnly, comment, enabled, expiresAt, userIds, userAccess } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const existing = db.prepare('SELECT * FROM shares WHERE id = ? AND user_id = ?').get(id, session.userId) as any;
      if (!existing) return res.status(404).json({ error: 'Share not found' });

      withTransaction((tx) => {
        const patch: Record<string, any> = {};
        if (name !== undefined) patch.name = validateSambaShareName(name);
        if (rawSharePath !== undefined) patch.path = resolveWithinRoot(rawSharePath);
        if (readOnly !== undefined) patch.readOnly = readOnly ? 1 : 0;
        if (comment !== undefined) patch.comment = sanitizeSambaText(comment);
        if (enabled !== undefined) patch.enabled = enabled ? 1 : 0;
        if (expiresAt !== undefined) patch.expiresAt = expiresAt || null;

        const { setSql, values } = buildAllowedUpdate(patch, {
          name: 'name',
          path: 'path',
          readOnly: 'read_only',
          comment: 'comment',
          enabled: 'enabled',
          expiresAt: 'expires_at',
        });
        if (setSql) tx.prepare(`UPDATE shares SET ${setSql} WHERE id = ? AND user_id = ?`).run(...values, id, session.userId);

        if (Array.isArray(userIds) || Array.isArray(userAccess)) {
          tx.prepare('DELETE FROM share_users WHERE share_id = ?').run(id);
          const linkStmt = tx.prepare(
            'INSERT OR IGNORE INTO share_users (share_id, samba_user_id, access) VALUES (?, ?, ?)'
          );
          for (const row of normalizeAccessRows(userIds, userAccess, !!(readOnly ?? existing.read_only))) {
            linkStmt.run(id, row.id ?? row.userId ?? row, row.access === 'read' ? 'read' : 'write');
          }
        }
      });

      regenerateSmbConf(db);
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const deleted = withTransaction((tx) => tx.prepare(
        'DELETE FROM shares WHERE id = ? AND user_id = ?'
      ).run(id, session.userId));
      if (deleted.changes === 0) return res.status(404).json({ error: 'Share not found' });

      regenerateSmbConf(db);
      return res.json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).end();
  } catch (err: any) {
    console.error('[/api/shares]', err);
    return res.status(500).json({ error: 'Share operation failed' });
  }
}, { ability: 'write', minRole: 'admin' });
