import { getSession } from '../../../lib/auth.ts';
import { csrfTokenForSession, buildCsrfCookie } from '../../../lib/request-security.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();
  const session = await getSession(req);
  if (!session?.sessionId) return res.json({ csrfToken: '' });

  res.setHeader('Set-Cookie', buildCsrfCookie(session.sessionId));
  return res.json({ csrfToken: csrfTokenForSession(session.sessionId) });
}
