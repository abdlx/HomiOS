import * as otplib from 'otplib';
const authenticator = (otplib as any).authenticator ?? (otplib as any).default?.authenticator ?? otplib;
import { getDb } from '../../../lib/db.ts';
import {
  findUserByEmail, verifyPassword, hashPassword, createSession, ensurePersonalTeam, createUserWithPasswordHash,
} from '../../../lib/auth.ts';
import { buildAuthCookies } from '../../../lib/api-auth.ts';
import { decryptSecret, sha256 } from '../../../lib/crypto.ts';
import { logAudit } from '../../../lib/audit.ts';
import { withTransaction } from '../../../lib/db.ts';

// Simple in-memory rate limit: 10 attempts / 5 min per IP.
const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || now > a.resetAt) { attempts.set(ip, { count: 1, resetAt: now + 300_000 }); return false; }
  a.count += 1;
  return a.count > 10;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown');
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });

  try {
    const { email, password, totp } = req.body || {};
    const db = getDb();

    // 1. ENV admin login — backed by a real, revocable DB session.
    const envUser = process.env.ADMIN_USERNAME;
    const envPass = process.env.ADMIN_PASSWORD;
    if (envUser && envPass && email === envUser && password === envPass) {
      let admin = db.prepare('SELECT id FROM users WHERE email = ?').get(envUser) as any;
      if (!admin) {
        const hash = await hashPassword(envPass);
        admin = { id: withTransaction((tx) => createUserWithPasswordHash(tx, envUser, hash)) };
      }
      ensurePersonalTeam(admin.id, envUser);
      const sessionId = createSession(admin.id);
      res.setHeader('Set-Cookie', buildAuthCookies(sessionId, req));
      return res.json({ ok: true });
    }

    // 2. DB user login
    const user = findUserByEmail(String(email || ''));
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await verifyPassword(String(password || ''), user.password_hash);
    if (!match) {
      logAudit({ userId: user.id, action: 'auth.login_failed', meta: { ip } });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3. Two-factor (TOTP or recovery code) when enabled.
    if (user.totp_enabled) {
      if (!totp) return res.status(200).json({ ok: false, totpRequired: true });
      const secret = decryptSecret(user.totp_secret);
      const code = String(totp).replace(/\s/g, '');
      let valid = authenticator.verify({ token: code, secret });
      if (!valid && user.recovery_codes) {
        const codes: string[] = JSON.parse(user.recovery_codes);
        const idx = codes.indexOf(sha256(code));
        if (idx >= 0) {
          codes.splice(idx, 1); // recovery codes are single-use
          withTransaction((tx) => {
            tx.prepare('UPDATE users SET recovery_codes = ? WHERE id = ?').run(JSON.stringify(codes), user.id);
          });
          valid = true;
        }
      }
      if (!valid) return res.status(401).json({ error: 'Invalid two-factor code' });
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
