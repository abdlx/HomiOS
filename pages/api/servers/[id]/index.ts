/**
 * /api/servers/[id]
 * GET    - server detail
 * PATCH  - update { name?, description?, ip?, port?, sshUser?, privateKeyId? }
 * DELETE - remove
 */
import { getDb } from '../../../../lib/db.ts';
import { withAuth } from '../../../../lib/api-auth.ts';
import { logAudit } from '../../../../lib/audit.ts';

export default withAuth(async (req, res, session) => {
  const db = getDb();
  const id = String(req.query.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ? AND team_id = ?').get(id, session.teamId) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  if (req.method === 'GET') return res.json(server);

  if (req.method === 'PATCH') {
    const { name, description, ip, port, sshUser, privateKeyId } = req.body || {};
    db.prepare(`
      UPDATE servers SET
        name = COALESCE(?, name), description = COALESCE(?, description),
        ip = COALESCE(?, ip), port = COALESCE(?, port),
        ssh_user = COALESCE(?, ssh_user), private_key_id = COALESCE(?, private_key_id)
      WHERE id = ?
    `).run(name ?? null, description ?? null, ip ?? null, port ?? null, sshUser ?? null, privateKeyId ?? null, id);
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'server.updated', resourceId: id });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    db.prepare('DELETE FROM servers WHERE id = ?').run(id);
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'server.deleted', resourceId: id });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
  return res.status(405).end();
}, { ability: 'write' });
