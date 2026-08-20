import fs from 'fs';
import { getDb, buildAllowedUpdate, withTransaction } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { regenerateSmbConf, SambaConfigError } from '../../../lib/samba.ts';
import { resolveWithinRoot, sanitizeSambaText, validateSambaShareName } from '../../../lib/safe-paths.ts';
import { ValidationError } from '../../../lib/validate.ts';

function normalizeAccessRows(userIds: any[], userAccess: any[], readOnly: boolean) {
  return Array.isArray(userAccess) && userAccess.length > 0
    ? userAccess
    : (Array.isArray(userIds) ? userIds.map((uid: any) => ({ id: uid, access: readOnly ? 'read' : 'write' })) : []);
}

function validateExpiry(value: any): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError('Expiry date is invalid');
  return parsed.toISOString();
}

function validateAccessRows(db: any, rows: any[]) {
  const normalized = rows.map((row: any) => ({
    id: Number(row?.id ?? row?.userId ?? row),
    access: row?.access === 'read' ? 'read' : 'write',
  }));
  if (normalized.some((row) => !Number.isSafeInteger(row.id) || row.id <= 0)) {
    throw new ValidationError('One or more Samba users are invalid');
  }
  const uniqueIds = [...new Set(normalized.map((row) => row.id))];
  if (uniqueIds.length > 0) {
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const found = db.prepare(`SELECT COUNT(*) as count FROM samba_users WHERE enabled = 1 AND id IN (${placeholders})`).get(...uniqueIds) as any;
    if ((found?.count || 0) !== uniqueIds.length) throw new ValidationError('One or more selected Samba users are missing or disabled');
  }
  return normalized;
}

function requireAccessUser(rows: any[], enabled: boolean) {
  if (enabled && rows.length === 0) {
    throw new ValidationError('Select at least one enabled Samba user before publishing this share');
  }
}

function ensureShareDirectory(sharePath: string) {
  if (!fs.existsSync(sharePath)) fs.mkdirSync(sharePath, { recursive: true, mode: 0o775 });
  if (!fs.statSync(sharePath).isDirectory()) throw new ValidationError('Share path must be a directory');
}

function shareErrorResponse(res: any, error: any) {
  if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
  if (error instanceof SambaConfigError) {
    const status = error.code === 'validation' ? 422 : 503;
    const messages = {
      validation: 'The generated Samba configuration was rejected. The share was not saved.',
      write: 'HomiOS cannot write the Samba configuration. The share was not saved.',
      reload: 'Samba could not reload the new configuration. The share was not saved; check that smbd is running.',
      unavailable: 'Samba or testparm is not installed or available. The share was not saved.',
    };
    return res.status(status).json({ error: messages[error.code] });
  }
  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(error?.message || '')) {
    return res.status(409).json({ error: 'A Samba share with that name already exists' });
  }
  if (error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(400).json({ error: 'One or more selected Samba users no longer exist' });
  }
  if (error?.code === 'EACCES' || error?.code === 'EPERM' || error?.code === 'EROFS') {
    return res.status(403).json({ error: 'HomiOS does not have permission to create or share that directory' });
  }
  return res.status(500).json({ error: 'Share operation failed. Check the HomiOS server log for details.' });
}

export default withAuth(async function handler(req: any, res: any, session: any) {
  const db = getDb();

  try {
    if (req.method === 'GET') {
      const shares = db.prepare(
        'SELECT * FROM shares WHERE user_id = ? ORDER BY created_at DESC'
      ).all(session.userId) as any[];

      return res.json(shares.map((share) => {
        let publishError: string | null = null;
        try {
          if (share.enabled) resolveWithinRoot(share.path);
        } catch (error: any) {
          publishError = error?.message || 'This share is not publishable';
        }
        const sambaUsers = db.prepare(`
          SELECT su.id, su.username, su.enabled, COALESCE(shu.access, 'write') as access
          FROM samba_users su
          JOIN share_users shu ON shu.samba_user_id = su.id
          WHERE shu.share_id = ?
        `).all(share.id) as any[];
        if (share.enabled && sambaUsers.filter((user) => user.enabled).length === 0) {
          publishError ||= 'Assign at least one enabled Samba user';
        }
        return { ...share, sambaUsers, published: !!share.enabled && !publishError, publishError };
      }));
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
      const safeExpiry = validateExpiry(expiresAt);
      const accessRows = validateAccessRows(db, normalizeAccessRows(userIds, userAccess, readOnly));
      requireAccessUser(accessRows, !!enabled);
      const existingShare = db.prepare('SELECT * FROM shares WHERE name = ?').get(safeName) as any;
      if (existingShare && (existingShare.user_id !== session.userId || existingShare.path !== sharePath)) {
        return res.status(409).json({ error: 'A Samba share with that name already exists' });
      }
      ensureShareDirectory(sharePath);

      // Repair shares left in SQLite by older builds that swallowed smb.conf
      // write/reload failures. Retrying the same name/path now reconciles Samba
      // instead of throwing another unique-constraint 500.
      if (existingShare) {
        withTransaction((tx) => {
          tx.prepare(`
            UPDATE shares
            SET read_only = ?, comment = ?, enabled = ?, expires_at = ?
            WHERE id = ? AND user_id = ?
          `).run(readOnly ? 1 : 0, safeComment, enabled ? 1 : 0, safeExpiry, existingShare.id, session.userId);
          tx.prepare('DELETE FROM share_users WHERE share_id = ?').run(existingShare.id);
          const linkStmt = tx.prepare(
            'INSERT INTO share_users (share_id, samba_user_id, access) VALUES (?, ?, ?)'
          );
          for (const row of accessRows) linkStmt.run(existingShare.id, row.id, row.access);
          regenerateSmbConf(tx);
        });
        return res.status(200).json({
          ok: true,
          id: existingShare.id,
          repaired: true,
          uncPath: `\\\\server\\${safeName}`,
        });
      }

      const shareId = withTransaction((tx) => {
        const result = tx.prepare(
          'INSERT INTO shares (user_id, name, path, read_only, comment, enabled, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(session.userId, safeName, sharePath, readOnly ? 1 : 0, safeComment, enabled ? 1 : 0, safeExpiry);

        const linkStmt = tx.prepare(
          'INSERT INTO share_users (share_id, samba_user_id, access) VALUES (?, ?, ?)'
        );
        for (const row of accessRows) linkStmt.run(result.lastInsertRowid, row.id, row.access);

        // Throwing here rolls the database insert back if Samba validation,
        // installation, or reload fails.
        regenerateSmbConf(tx);
        return result.lastInsertRowid;
      });

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
        if (rawSharePath !== undefined) {
          patch.path = resolveWithinRoot(rawSharePath);
          ensureShareDirectory(patch.path);
        }
        if (readOnly !== undefined) patch.readOnly = readOnly ? 1 : 0;
        if (comment !== undefined) patch.comment = sanitizeSambaText(comment);
        if (enabled !== undefined) patch.enabled = enabled ? 1 : 0;
        if (expiresAt !== undefined) patch.expiresAt = validateExpiry(expiresAt);

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
          const accessRows = validateAccessRows(tx, normalizeAccessRows(userIds, userAccess, !!(readOnly ?? existing.read_only)));
          requireAccessUser(accessRows, !!(enabled ?? existing.enabled));
          tx.prepare('DELETE FROM share_users WHERE share_id = ?').run(id);
          const linkStmt = tx.prepare('INSERT INTO share_users (share_id, samba_user_id, access) VALUES (?, ?, ?)');
          for (const row of accessRows) linkStmt.run(id, row.id, row.access);
        }
        if (!Array.isArray(userIds) && !Array.isArray(userAccess) && !!(enabled ?? existing.enabled)) {
          const access = tx.prepare('SELECT COUNT(*) AS count FROM share_users WHERE share_id = ?').get(id) as any;
          requireAccessUser(Array.from({ length: access?.count || 0 }), true);
        }
        regenerateSmbConf(tx);
      });

      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const deleted = withTransaction((tx) => {
        const result = tx.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?').run(id, session.userId);
        if (result.changes > 0) regenerateSmbConf(tx);
        return result;
      });
      if (deleted.changes === 0) return res.status(404).json({ error: 'Share not found' });
      return res.json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).end();
  } catch (error: any) {
    console.error('[/api/shares]', error);
    return shareErrorResponse(res, error);
  }
}, { adminOnly: true, ability: 'write' });
