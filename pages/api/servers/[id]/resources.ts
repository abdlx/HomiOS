/**
 * GET /api/servers/[id]/resources - disk usage on the server.
 */
import { getDb } from '../../../../lib/db.ts';
import { withAuth } from '../../../../lib/api-auth.ts';
import { sshExec, sshTargetForServer } from '../../../../lib/ssh.ts';

export default withAuth(async (req, res, session) => {
  if (req.method !== 'GET') return res.status(405).end();

  const db = getDb();
  const id = String(req.query.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ? AND team_id = ?').get(id, session.teamId) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    if (server.is_localhost) {
      return res.json({ diskUsage: [] });
    }
    const target = sshTargetForServer(id);
    const df = await sshExec(target, 'df -h --output=source,size,used,avail,pcent,target | tail -n +2', undefined, 20_000);
    const diskUsage = df.code === 0
      ? df.stdout.trim().split('\n').filter(Boolean).map((line) => {
          const parts = line.trim().split(/\s+/);
          const [source, size, used, avail, pcent, ...mountParts] = parts;
          return { source, size, used, avail, pcent, mount: mountParts.join(' ') };
        })
      : [];
    return res.json({ diskUsage });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
