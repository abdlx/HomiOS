import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { email, password } = req.body;

    // 1. ENV Variable Auth (Bypasses DB)
    const envUser = process.env.ADMIN_USERNAME;
    const envPass = process.env.ADMIN_PASSWORD;

    if (envUser && envPass && email === envUser && password === envPass) {
      const sessionId = crypto.createHmac('sha256', envPass).update(envUser).digest('hex');
      res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; Max-Age=2592000`);
      return res.json({ ok: true });
    }

    // 2. DB Auth Fallback
    try {
      const db = new Database(process.env.DATABASE_URL || './data/filemanager.db');
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
      if (!user) return res.status(401).json({ error: 'Invalid credentials' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return res.status(401).json({ error: 'Invalid credentials' });

      const sessionId = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
        .run(sessionId, user.id, expiresAt);

      res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; Max-Age=2592000`);
      return res.json({ ok: true });
    } catch (dbErr: any) {
      // If DB doesn't exist or table missing, we just deny access (since ENV auth also failed)
      return res.status(401).json({ error: 'Invalid credentials or DB not setup' });
    }

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
