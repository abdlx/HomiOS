import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { buildSessionCookie } from '../../../lib/api-auth.ts';

function ensureSchema(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);
}

function createSession(db: any, userId: number): string {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);
  return sessionId;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { email, password } = req.body;
    const db = new Database(process.env.DATABASE_URL || './data/filemanager.db');
    ensureSchema(db);

    // 1. ENV admin login — now backed by a REAL, random, revocable DB session
    //    (was a static, forgeable HMAC that getSession could never validate).
    const envUser = process.env.ADMIN_USERNAME;
    const envPass = process.env.ADMIN_PASSWORD;
    if (envUser && envPass && email === envUser && password === envPass) {
      let admin = db.prepare('SELECT id FROM users WHERE email = ?').get(envUser) as any;
      if (!admin) {
        const hash = await bcrypt.hash(envPass, 10);
        const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(envUser, hash);
        admin = { id: r.lastInsertRowid };
      }
      const sessionId = createSession(db, admin.id);
      res.setHeader('Set-Cookie', buildSessionCookie(sessionId));
      return res.json({ ok: true });
    }

    // 2. DB user login
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const sessionId = createSession(db, user.id);
    res.setHeader('Set-Cookie', buildSessionCookie(sessionId));
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
