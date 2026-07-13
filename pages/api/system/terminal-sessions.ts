import { withAuth } from '../../../lib/api-auth.ts';

export default withAuth(async (req: any, res: any) => {
  const sessions: Map<string, any> = (global as any).openfinderTerminalSessions || new Map();

  if (req.method === 'GET') {
    return res.json(Array.from(sessions.values()).map((session) => ({
      id: session.id,
      shell: session.shell,
      startedAt: session.startedAt,
    })));
  }

  if (req.method === 'DELETE') {
    const id = String(req.body?.id || req.query.id || '');
    const session = sessions.get(id);
    if (!session) return res.status(404).json({ error: 'Terminal session not found' });
    session.kill();
    sessions.delete(id);
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'DELETE']);
  return res.status(405).end();
}, { adminOnly: true, ability: 'write' });
