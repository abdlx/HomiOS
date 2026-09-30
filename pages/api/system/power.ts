import { withAuth } from '../../../lib/api-auth.ts';
import { getDb } from '../../../lib/db.ts';
import { verifyPassword } from '../../../lib/auth.ts';
import { clientIp, hitRateLimit } from '../../../lib/request-security.ts';
import { logAudit } from '../../../lib/audit.ts';
import { scheduleHostPower, type HostPowerAction } from '../../../lib/system-power.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  // A browser session and fresh password are required for host-level actions.
  if (session.via !== 'session') return res.status(403).json({ error: 'Use an administrator browser session' });

  const action = req.body?.action;
  const password = req.body?.password;
  if (action !== 'poweroff' && action !== 'reboot') return res.status(400).json({ error: 'Invalid power action' });
  if (typeof password !== 'string' || !password || password.length > 1024) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const limit = hitRateLimit(`system-power:${session.userId}`, { windowMs: 15 * 60_000, max: 5 });
  if (limit.limited) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }

  const user = getDb().prepare('SELECT password_hash FROM users WHERE id = ?').get(session.userId) as { password_hash: string } | undefined;
  if (!user || !await verifyPassword(password, user.password_hash)) {
    logAudit({ userId: session.userId, action: 'system.power_denied', meta: { action, ip: clientIp(req) } });
    return res.status(401).json({ error: 'Incorrect password' });
  }

  try {
    scheduleHostPower(action as HostPowerAction);
  } catch (error) {
    console.error('[system-power] unavailable:', error);
    return res.status(503).json({ error: 'Host power controls are unavailable on this installation' });
  }

  logAudit({ userId: session.userId, action: `system.${action}`, meta: { ip: clientIp(req) } });
  return res.status(202).json({ ok: true });
}, { adminOnly: true, ability: 'write' });
