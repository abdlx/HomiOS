import type { NextApiResponse } from 'next';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { withAuth, AuthenticatedRequest } from '../../../lib/api-auth';
import { db } from '../../../lib/db';
import { encryptSecret, decryptSecret, sha256 } from '../../../lib/crypto';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  const user = db.prepare('SELECT id, username, password_hash, totp_secret, totp_enabled FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // GET: Return current 2FA status
  if (req.method === 'GET') {
    return res.status(200).json({ enabled: Boolean(user.totp_enabled) });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, code, password } = req.body || {};

  // POST action === "init": Generate secret and QR code (encrypt secret at rest)
  if (action === 'init') {
    const plainSecret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.username || 'user', 'HomiOS', plainSecret);
    const qrCode = await QRCode.toDataURL(otpauth);

    // Encrypt secret with AES-256-GCM via APP_KEY before saving to SQLite
    const encryptedSecret = encryptSecret(plainSecret);
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(encryptedSecret, user.id);
    return res.status(200).json({ ok: true, secret: plainSecret, qrCode, qrDataUrl: qrCode });
  }

  // POST action === "enable": Verify code, generate recovery codes, activate
  if (action === 'enable') {
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Verification code is required' });
    }
    if (!user.totp_secret) {
      return res.status(400).json({ error: '2FA initialization missing. Click Setup first.' });
    }

    const plainSecret = decryptSecret(user.totp_secret);
    if (!plainSecret) {
      return res.status(500).json({ error: 'Failed to decrypt 2FA secret' });
    }

    const delta = authenticator.checkDelta(code.trim(), plainSecret);
    if (delta === null || delta === undefined) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Generate 10 recovery codes, hashed with sha256 matching login.ts consumeRecoveryCode
    const recoveryCodes: string[] = [];
    const hashedCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const raw = crypto.randomBytes(4).toString('hex'); // 8 hex chars
      recoveryCodes.push(raw);
      hashedCodes.push(sha256(raw));
    }

    // Store in both recovery_codes (consumed by login.ts) and totp_backup_codes
    db.prepare('UPDATE users SET totp_enabled = 1, recovery_codes = ?, totp_backup_codes = ? WHERE id = ?').run(
      JSON.stringify(hashedCodes),
      JSON.stringify(hashedCodes),
      user.id
    );

    return res.status(200).json({
      ok: true,
      enabled: true,
      recoveryCodes,
      message: 'Two-Factor Authentication enabled.',
    });
  }

  // POST action === "disable": Verify password and disable 2FA
  if (action === 'disable') {
    if (!password) {
      return res.status(400).json({ error: 'Password confirmation is required' });
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, recovery_codes = NULL, totp_backup_codes = NULL WHERE id = ?').run(user.id);
    return res.status(200).json({ ok: true, enabled: false, message: 'Two-Factor Authentication disabled.' });
  }

  return res.status(400).json({ error: 'Invalid action. Supported: init, enable, disable.' });
}

export default withAuth(handler);
