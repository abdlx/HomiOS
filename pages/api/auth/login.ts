/**
 * Password + TOTP login.
 *
 * The ADMIN_USERNAME/ADMIN_PASSWORD env login that used to sit in front of this was
 * removed. It bypassed 2FA entirely, compared secrets non-constant-time, shipped as
 * admin/password in .env.example, and — because it created the first user without
 * marking the instance initialized — left /api/auth/setup open to anonymous account
 * creation. Bootstrap now goes through /api/auth/setup only.
 *
 * Per-IP rate limiting is applied globally in server.js. The per-ACCOUNT lockout below
 * is the complement: it stops a distributed/rotating-IP attack against one account, and
 * it is what makes the 6-digit TOTP space non-brute-forceable.
 */
import * as otplib from 'otplib';
const authenticator = (otplib as any).authenticator ?? (otplib as any).default?.authenticator ?? otplib;
import { getDb, withTransaction } from '../../../lib/db.ts';
import { findUserByEmail, verifyPassword, createSession, ensurePersonalTeam } from '../../../lib/auth.ts';
import { buildAuthCookies } from '../../../lib/api-auth.ts';
import { decryptSecret, sha256, safeEqual } from '../../../lib/crypto.ts';
import { logAudit } from '../../../lib/audit.ts';
import { clientIp, hitRateLimit } from '../../../lib/request-security.ts';

const ACCOUNT_LOCKOUT = { windowMs: 15 * 60_000, max: 10 };

/**
 * A bcrypt hash of a random string. Verifying against it when the account does not
 * exist keeps the response time indistinguishable from a wrong-password response,
 * so login cannot be used to enumerate valid emails.
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO.7Vv0Ck9wQY4WQ0kXWl0PXo8pJ3lVvW';

/** Lockout semantics: once ACCOUNT_LOCKOUT.max failures are on record, stop. */
function accountLocked(email: string): boolean {
  const { count } = hitRateLimit(`login-account:${email}`, { ...ACCOUNT_LOCKOUT, peek: true });
  return count >= ACCOUNT_LOCKOUT.max;
}

function recordFailure(email: string): void {
  hitRateLimit(`login-account:${email}`, ACCOUNT_LOCKOUT);
}

/** Single-use recovery codes, compared in constant time. */
function consumeRecoveryCode(user: any, code: string): boolean {
  if (!user.recovery_codes) return false;
  let codes: string[];
  try {
    codes = JSON.parse(user.recovery_codes);
  } catch {
    return false;
  }
  const hashed = sha256(code);
  const idx = codes.findIndex((stored) => safeEqual(stored, hashed));
  if (idx < 0) return false;

  codes.splice(idx, 1);
  withTransaction((tx) => {
    tx.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(codes), user.id);
  });
  return true;
}

/**
 * Verify a TOTP and burn its time step.
 *
 * Without the last_totp_step check a valid code stays replayable for its whole
 * window, so an attacker who observes one (shoulder-surf, phishing proxy, log leak)
 * can reuse it. Recording the accepted step makes each code strictly single-use.
 */
function verifyTotp(db: any, user: any, code: string): boolean {
  const secret = decryptSecret(user.totp_secret);
  if (!secret) return false;

  const delta = authenticator.checkDelta(code, secret);
  if (delta === null || delta === undefined) return false;

  const step = Math.floor(Date.now() / 1000 / 30) + Number(delta);
  if (Number(user.last_totp_step || 0) >= step) return false; // already used

  db.prepare('UPDATE users SET last_totp_step = ? WHERE id = ?').run(step, user.id);
  return true;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const ip = clientIp(req);

  try {
    const { email, password, totp } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const db = getDb();

    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    if (accountLocked(cleanEmail)) {
      logAudit({ action: 'auth.login_locked', meta: { email: cleanEmail, ip } });
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }

    const user = findUserByEmail(cleanEmail);

    // Always run a bcrypt compare, even for unknown accounts — constant-ish timing.
    const match = await verifyPassword(String(password), user?.password_hash || DUMMY_HASH);
    if (!user || !match) {
      recordFailure(cleanEmail);
      logAudit({ userId: user?.id ?? null, action: 'auth.login_failed', meta: { email: cleanEmail, ip } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.totp_enabled) {
      if (!totp) return res.status(200).json({ ok: false, totpRequired: true });
      const code = String(totp).replace(/\s/g, '');

      const valid = verifyTotp(db, user, code) || consumeRecoveryCode(user, code);
      if (!valid) {
        recordFailure(cleanEmail);
        logAudit({ userId: user.id, action: 'auth.totp_failed', meta: { ip } });
        return res.status(401).json({ error: 'Invalid two-factor code' });
      }
    }

    ensurePersonalTeam(user.id, user.email);
    const sessionId = createSession(user.id);
    logAudit({ userId: user.id, action: 'auth.login', meta: { ip } });
    res.setHeader('Set-Cookie', buildAuthCookies(sessionId, req));
    return res.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/auth/login]', err);
    return res.status(500).json({ error: 'Login failed' });
  }
}
