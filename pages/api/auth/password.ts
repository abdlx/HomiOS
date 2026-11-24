import type { NextApiResponse } from 'next';
import bcrypt from 'bcryptjs';
import { withAuth, AuthenticatedRequest } from '../../../lib/api-auth';
import { db } from '../../../lib/db';

function parseCookieHeader(header?: string): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
    }
  }
  return out;
}

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

  // Update password hash and increment token version
  db.prepare('UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?').run(newHash, nextVersion, user.id);

  // Actively revoke all other active sessions in the sessions table for this user
  const cookies = parseCookieHeader(req.headers.cookie);
  const currentSessionId = cookies['homios_session'] || cookies['session'] || '';
  if (currentSessionId) {
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(user.id, currentSessionId);
  } else {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  }

  return res.status(200).json({ ok: true, message: 'Password updated successfully. Other active sessions revoked.' });
}

export default withAuth(handler);
