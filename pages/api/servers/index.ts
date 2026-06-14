/**
 * /api/servers
 * GET  â€” list team servers with status
 * POST â€” register a server { name, ip, port?, sshUser?, privateKeyId } or { localhost: true }
 */
import crypto from 'crypto';
import { getDb } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';

export default withAuth(async (req, res, session) => {
  const db = getDb();

  if (req.method === 'GET') {
    const servers = db.prepare(`
      SELECT s.id, s.name, s.description, s.ip, s.port, s.ssh_user, s.private_key_id,
             s.is_localhost, s.is_reachable, s.is_usable, s.proxy_status,
             s.last_check_at, s.created_at,
             k.name AS key_name
      FROM servers s LEFT JOIN private_keys k ON k.id = s.private_key_id
      WHERE s.team_id = ? ORDER BY s.is_localhost DESC, s.created_at ASC
    `).all(session.teamId);
    return res.json(servers);
  }

  if (req.method === 'POST') {
    const { name, ip, port = 22, sshUser = 'root', privateKeyId, localhost = false } = req.body || {};
    const id = crypto.randomUUID();

    if (localhost) {
      const existing = db.prepare('SELECT id FROM servers WHERE team_id = ? AND is_localhost = 1').get(session.teamId);
      if (existing) return res.status(400).json({ error: 'Localhost server already registered' });
      db.prepare(`
        INSERT INTO servers (id, team_id, name, ip, port, ssh_user, is_localhost, is_reachable, is_usable)
        VALUES (?, ?, ?, 'localhost', 0, '', 1, 1, 1)
      `).run(id, session.teamId, name || 'localhost');
      logAudit({ teamId: session.teamId, userId: session.userId, action: 'server.created', resourceId: id, meta: { localhost: true } });
      return res.status(201).json({ ok: true, id });
    }

    if (!name || !ip || !privateKeyId) {
      return res.status(400).json({ error: 'name, ip and privateKeyId are required' });
    }
    const key = db.prepare('SELECT id FROM private_keys WHERE id = ? AND team_id = ?').get(String(privateKeyId), session.teamId);
    if (!key) return res.status(400).json({ error: 'SSH key not found in this team' });

    db.prepare(`
      INSERT INTO servers (id, team_id, name, ip, port, ssh_user, private_key_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, session.teamId, String(name), String(ip), Number(port) || 22, String(sshUser), String(privateKeyId));
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'server.created', resourceId: id, meta: { name, ip } });
    return res.status(201).json({ ok: true, id });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end();
}, { ability: 'write' });

