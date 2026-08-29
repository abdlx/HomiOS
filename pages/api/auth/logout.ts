import { destroySession } from '../../../lib/auth.ts';
import { clearAuthCookies } from '../../../lib/api-auth.ts';
import { LEGACY_SESSION_COOKIE, SESSION_COOKIE, parseCookies } from '../../../lib/request-security.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE] || cookies[LEGACY_SESSION_COOKIE];
  if (sessionId) { try { destroySession(sessionId); } catch {} }
  res.setHeader('Set-Cookie', clearAuthCookies());
  res.json({ ok: true });
}
