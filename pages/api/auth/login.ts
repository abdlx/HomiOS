import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const db = new Database('/app/data/filemanager.db');
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sessionId, user.id, expiresAt);

    res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; Max-Age=2592000`);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
