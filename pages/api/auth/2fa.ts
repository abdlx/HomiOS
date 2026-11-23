import type { NextApiResponse } from 'next';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { withAuth, AuthenticatedRequest } from '../../../lib/api-auth';
import { db } from '../../../lib/db';

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

  // POST action === "init": Generate secret and QR code
  if (action === 'init') {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.username || 'user', 'HomiOS', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    // Store unconfirmed secret
    db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);
    return res.status(200).json({ ok: true, secret, qrCode, qrDataUrl: qrCode });
  }

  // POST action === "enable": Verify code, generate backup codes, activate
  if (action === 'enable') {
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Verification code is required' });
    }
    if (!user.totp_secret) {
      return res.status(400).json({ error: '2FA initialization missing. Click Setup first.' });
    }

    const isValid = authenticator.check(code.trim(), user.totp_secret);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Generate 10 backup recovery codes
    const recoveryCodes: string[] = [];
    const hashedCodes: string[] = [];
    const sha256Codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const raw = crypto.randomBytes(4).toString('hex');
      recoveryCodes.push(raw);
      hashedCodes.push(await bcrypt.hash(raw, 10));
      sha256Codes.push(crypto.createHash('sha256').update(raw).digest('hex'));
    }

    db.prepare('UPDATE users SET totp_enabled = 1, totp_backup_codes = ?, recovery_codes = ? WHERE id = ?').run(
      JSON.stringify(hashedCodes),
      JSON.stringify(sha256Codes),
      user.id
    );

    return res.status(200).json({
      ok: true,
      enabled: true,
      recoveryCodes,
      backupCodes: recoveryCodes,
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

    db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL, recovery_codes = NULL WHERE id = ?').run(user.id);
    return res.status(200).json({ ok: true, enabled: false, message: 'Two-Factor Authentication disabled.' });
  }

  return res.status(400).json({ error: 'Invalid action. Supported: init, enable, disable.' });
}

export default withAuth(handler);
