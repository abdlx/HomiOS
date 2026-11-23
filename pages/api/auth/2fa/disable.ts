import type { NextApiResponse } from 'next';
import { authenticator } from 'otplib';
import bcrypt from 'bcryptjs';
import { withAuth, AuthenticatedRequest } from '../../../../lib/api-auth';
import { db } from '../../../../lib/db';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, code } = req.body || {};
  if (!password || !code) {
    return res.status(400).json({ error: 'Password and 2FA code are required' });
  }

  const user = db.prepare('SELECT id, password_hash, totp_secret, totp_enabled FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user || !user.totp_enabled || !user.totp_secret) {
    return res.status(400).json({ error: '2FA is not currently enabled' });
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const codeOk = authenticator.check(code.trim(), user.totp_secret);
  if (!codeOk) {
    return res.status(400).json({ error: 'Invalid 2FA code' });
  }

  db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL WHERE id = ?').run(user.id);

  return res.status(200).json({ ok: true, message: 'Two-Factor Authentication disabled.' });
}

export default withAuth(handler);
