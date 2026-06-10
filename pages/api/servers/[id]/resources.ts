/**
 * GET /api/servers/[id]/resources — running containers + disk usage on the server.
 */
import path from 'path';
import { getDb } from '../../../../lib/db.ts';
import { withAuth } from '../../../../lib/api-auth.ts';
import { getExecutor } from '../../../../lib/docker.ts';

export default withAuth(async (req, res, session) => {
  if (req.method !== 'GET') return res.status(405).end();

  const db = getDb();
  const id = String(req.query.id);
  const server = db.prepare('SELECT * FROM servers WHERE id = ? AND team_id = ?').get(id, session.teamId) as any;
  if (!server) return res.status(404).json({ error: 'Server not found' });

  try {
    const exec = await getExecutor(server.is_localhost ? null : id, path.join(process.cwd(), 'data', 'stacks'));
    const ps = await exec.docker(['ps', '-a', '--format', '{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}']);
    const containers = ps.code === 0
      ? ps.stdout.trim().split('\n').filter(Boolean).map((line) => {
          const [name, image, statusText, state] = line.split('|');
          return { name, image, statusText, state };
        })
      : [];
    const df = await exec.docker(['system', 'df', '--format', '{{.Type}}|{{.TotalCount}}|{{.Size}}|{{.Reclaimable}}']);
    const diskUsage = df.code === 0
      ? df.stdout.trim().split('\n').filter(Boolean).map((line) => {
          const [type, count, size, reclaimable] = line.split('|');
          return { type, count, size, reclaimable };
        })
      : [];
    return res.json({ containers, diskUsage });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});
