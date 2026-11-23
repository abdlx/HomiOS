import type { NextApiResponse } from 'next';
import { authenticator } from 'otplib';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { withAuth, AuthenticatedRequest } from '../../../../lib/api-auth';
import { db } from '../../../../lib/db';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: '6-digit verification code is required' });
  }

  const user = db.prepare('SELECT id, totp_secret, totp_enabled FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user || !user.totp_secret) {
    return res.status(400).json({ error: '2FA setup was not initiated. Run setup first.' });
  }

  const isValid = authenticator.check(code.trim(), user.totp_secret);
  if (!isValid) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  const plainBackupCodes: string[] = [];
  const hashedBackupCodes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const raw = crypto.randomBytes(4).toString('hex');
    plainBackupCodes.push(raw);
    hashedBackupCodes.push(await bcrypt.hash(raw, 10));
  }

  db.prepare('UPDATE users SET totp_enabled = 1, totp_backup_codes = ? WHERE id = ?').run(
    JSON.stringify(hashedBackupCodes),
    user.id
  );

  return res.status(200).json({
    ok: true,
    message: 'Two-Factor Authentication activated successfully.',
    backupCodes: plainBackupCodes,
  });
}

export default withAuth(handler);
