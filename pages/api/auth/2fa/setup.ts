import type { NextApiResponse } from 'next';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { withAuth, AuthenticatedRequest } from '../../../../lib/api-auth';
import { db } from '../../../../lib/db';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = db.prepare('SELECT id, username, totp_enabled FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.totp_enabled) {
    return res.status(400).json({ error: 'Two-Factor Authentication is already enabled' });
  }

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.username || 'user', 'HomiOS', secret);
  const qrCode = await QRCode.toDataURL(otpauth);

  db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, user.id);

  return res.status(200).json({ ok: true, secret, qrCode });
}

export default withAuth(handler);
