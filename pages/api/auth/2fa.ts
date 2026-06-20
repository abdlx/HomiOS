/**
 * Two-factor authentication (TOTP) management.
 *
 * POST { action: 'init' }                    -> { secret, otpauthUrl, qrDataUrl }
 * POST { action: 'enable', code }            -> verifies code, enables 2FA, returns recovery codes
 * POST { action: 'disable', password }       -> disables 2FA
 * GET                                         -> { enabled }
 */
import crypto from 'crypto';
import * as otplib from 'otplib';
const authenticator = (otplib as any).authenticator ?? (otplib as any).default?.authenticator ?? otplib;
import QRCode from 'qrcode';
import { getDb } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { verifyPassword } from '../../../lib/auth.ts';
import { encryptSecret, decryptSecret, sha256 } from '../../../lib/crypto.ts';
import { logAudit } from '../../../lib/audit.ts';
import { withTransaction } from '../../../lib/db.ts';

export default withAuth(async (req, res, session) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId) as any;

  if (req.method === 'GET') {
    return res.json({ enabled: !!user.totp_enabled });
  }

  if (req.method !== 'POST') return res.status(405).end();
  const { action, code, password } = req.body || {};

  if (action === 'init') {
    const secret = authenticator.generateSecret();
    withTransaction((tx) => {
      tx.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?')
        .run(encryptSecret(secret), session.userId);
    });
    const otpauthUrl = authenticator.keyuri(user.email, 'OpenFinder', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    return res.json({ secret, otpauthUrl, qrDataUrl });
  }

  if (action === 'enable') {
    const secret = decryptSecret(user.totp_secret);
    if (!secret) return res.status(400).json({ error: 'Run init first' });
    if (!authenticator.verify({ token: String(code || ''), secret })) {
      return res.status(400).json({ error: 'Invalid code' });
    }
    const plainCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));
    withTransaction((tx) => {
      tx.prepare('UPDATE users SET totp_enabled = 1, recovery_codes = ? WHERE id = ?')
        .run(JSON.stringify(plainCodes.map(sha256)), session.userId);
    });
    logAudit({ teamId: session.teamId, userId: session.userId, action: '2fa.enabled' });
    return res.json({ ok: true, recoveryCodes: plainCodes });
  }

  if (action === 'disable') {
    const match = await verifyPassword(String(password || ''), user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid password' });
    withTransaction((tx) => {
      tx.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL WHERE id = ?')
        .run(session.userId);
    });
    logAudit({ teamId: session.teamId, userId: session.userId, action: '2fa.disabled' });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
});
