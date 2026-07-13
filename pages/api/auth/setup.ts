/**
 * First-run setup — creates the instance administrator.
 *
 * This is now the ONLY bootstrap path; the ADMIN_USERNAME/ADMIN_PASSWORD env login
 * was removed because it skipped 2FA and, crucially, created the first user WITHOUT
 * marking the instance initialized — which left this endpoint open to anonymous
 * account creation forever. The "already initialized" check is hasAnyUser(), the same
 * predicate the UI uses, re-checked inside the transaction so two concurrent setup
 * requests cannot both succeed.
 */
import { getDb, withTransaction } from '../../../lib/db.ts';
import { createSession, createUserWithPasswordHash, hashPassword, hasAnyUser } from '../../../lib/auth.ts';
import { buildAuthCookies } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';
import { validateEmail, validatePassword, ValidationError } from '../../../lib/validate.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const db = getDb();
    if (hasAnyUser(db)) return res.status(400).json({ error: 'Already initialized' });

    const { email, password } = req.body || {};
    const cleanEmail = validateEmail(email);
    validatePassword(password);

    const passwordHash = await hashPassword(String(password));
    const userId = withTransaction((tx) => {
      // Re-check under BEGIN IMMEDIATE: closes the race between concurrent setups.
      if (hasAnyUser(tx)) throw new Error('Already initialized');
      return createUserWithPasswordHash(tx, cleanEmail, passwordHash, { isAdmin: true });
    });

    const sessionId = createSession(userId);
    logAudit({ userId, action: 'setup.admin_created', meta: { email: cleanEmail } });

    res.setHeader('Set-Cookie', buildAuthCookies(sessionId, req));
    res.json({ ok: true, userId });
  } catch (err: any) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
    if (err?.message === 'Already initialized') return res.status(400).json({ error: 'Already initialized' });
    console.error('[/api/auth/setup]', err);
    res.status(500).json({ error: 'Setup failed' });
  }
}
