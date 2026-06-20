import { destroySession } from '../../../lib/auth.ts';
import { clearAuthCookies } from '../../../lib/api-auth.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  const m = (req.headers.cookie || '').match(/session=([^;]+)/);
  if (m) { try { destroySession(m[1]); } catch {} }
  res.setHeader('Set-Cookie', clearAuthCookies());
  res.json({ ok: true });
}
