import type { NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { withAuth, AuthenticatedRequest } from '../../../lib/api-auth';
import { db } from '../../../lib/db';

async function handler(req: AuthenticatedRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long' });
  }

  const user = db.prepare('SELECT id, password_hash, token_version FROM users WHERE id = ?').get(req.user.id) as any;
  if (!user || !user.password_hash) {
    return res.status(404).json({ error: 'User not found' });
  }

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  const nextVersion = (user.token_version || 1) + 1;

  db.prepare('UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?').run(newHash, nextVersion, user.id);

  return res.status(200).json({ ok: true, message: 'Password updated successfully. Other active sessions revoked.' });
}

export default withAuth(handler);
