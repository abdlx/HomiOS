import { getDb } from '../../../lib/db.ts';
import { createSession, createUserWithPasswordHash, hashPassword } from '../../../lib/auth.ts';
import { buildAuthCookies } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';
import { withTransaction } from '../../../lib/db.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const db = getDb();
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const alreadyInit = db.prepare('SELECT 1 FROM initialized WHERE key = ?').get('setup_complete');
    if (alreadyInit) return res.status(400).json({ error: 'Already initialized' });

    const passwordHash = await hashPassword(String(password));
    const userId = withTransaction((tx) => {
      const initialized = tx.prepare('SELECT 1 FROM initialized WHERE key = ?').get('setup_complete');
      if (initialized) throw new Error('Already initialized');
      const newUserId = createUserWithPasswordHash(tx, String(email), passwordHash);
      tx.prepare('INSERT INTO initialized (key, value) VALUES (?, ?)').run('setup_complete', '1');
      return newUserId;
    });

    const sessionId = createSession(userId);
    logAudit({ userId, action: 'setup.admin_created', meta: { email } });

    res.setHeader('Set-Cookie', buildAuthCookies(sessionId));
    res.json({ ok: true, userId });
  } catch (err: any) {
    console.error('[/api/auth/setup]', err);
    if (err?.message === 'Already initialized') return res.status(400).json({ error: 'Already initialized' });
    res.status(500).json({ error: 'Setup failed' });
  }
}
