import type { NextApiRequest, NextApiResponse } from 'next';
import { authenticator } from 'otplib';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../../../lib/db';
import { createSessionCookie } from '../../../../lib/auth';

const JWT_SECRET = process.env.APP_KEY || 'homios-temp-jwt-secret';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tempToken, code } = req.body || {};
  if (!tempToken || !code) {
    return res.status(400).json({ error: 'Temporary token and 2FA code are required' });
  }

  let decoded: any;
  try {
    decoded = jwt.verify(tempToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId) as any;
  if (!user || !user.totp_enabled || !user.totp_secret) {
    return res.status(400).json({ error: 'Invalid 2FA state' });
  }

  const cleanCode = code.trim();
  let valid = authenticator.check(cleanCode, user.totp_secret);

  if (!valid && user.totp_backup_codes) {
    try {
      const hashedCodes: string[] = JSON.parse(user.totp_backup_codes);
      let matchIdx = -1;
      for (let i = 0; i < hashedCodes.length; i++) {
        if (await bcrypt.compare(cleanCode, hashedCodes[i])) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx !== -1) {
        valid = true;
        hashedCodes.splice(matchIdx, 1);
        db.prepare('UPDATE users SET totp_backup_codes = ? WHERE id = ?').run(
          JSON.stringify(hashedCodes),
          user.id
        );
      }
    } catch {}
  }

  if (!valid) {
    return res.status(401).json({ error: 'Invalid 2FA code or backup code' });
  }

  await createSessionCookie(res, user);
  return res.status(200).json({ ok: true, user: { id: user.id, username: user.username, role: user.role } });
}
