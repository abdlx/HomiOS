import { withAuth } from '../../../lib/api-auth.ts';
import { csrfTokenForSession } from '../../../lib/request-security.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  if (!session.sessionId) return res.status(400).json({ error: 'Session token unavailable' });
  return res.json({ csrfToken: csrfTokenForSession(session.sessionId) });
});
