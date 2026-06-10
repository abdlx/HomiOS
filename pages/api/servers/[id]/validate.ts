/**
 * POST /api/servers/[id]/validate — SSH round-trip + docker version probe.
 * POST with { installDocker: true } also installs Docker if missing.
 */
import { getDb } from '../../../../lib/db.ts';
import { withAuth } from '../../../../lib/api-auth.ts';
import { validateServer, installDocker } from '../../../../lib/ssh.ts';
import { logAudit } from '../../../../lib/audit.ts';

export default withAuth(async (req, res, session) => {
  if (req.method !== 'POST') return res.status(405).end();

  const db = getDb();
  const id = String(req.query.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ? AND team_id = ?').get(id, session.teamId) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });
  if (server.is_localhost) return res.json({ reachable: true, usable: true, localhost: true });

  if (req.body?.installDocker) {
    const result = await installDocker(id);
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'server.install_docker', resourceId: id, meta: { code: result.code } });
    if (result.code !== 0) return res.status(500).json({ error: 'Docker install failed', output: result.stderr.slice(-2000) });
  }

  const status = await validateServer(id);
  logAudit({ teamId: session.teamId, userId: session.userId, action: 'server.validated', resourceId: id, meta: status });
  return res.json(status);
}, { ability: 'write' });
