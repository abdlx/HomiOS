import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const db = new Database(process.env.DATABASE_URL || './data/filemanager.db');
    const { email, password } = req.body;

    // Create tables if they don't exist
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
      CREATE TABLE IF NOT EXISTS initialized (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Check if already initialized
    const alreadyInit = db.prepare('SELECT 1 FROM initialized WHERE key = ?').get('setup_complete');
    if (alreadyInit) {
      return res.status(400).json({ error: 'Already initialized' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const stmt = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)');
    const result = stmt.run(email, passwordHash);

    // Mark as initialized
    db.prepare('INSERT INTO initialized (key, value) VALUES (?, ?)').run('setup_complete', '1');

    // Create session
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .run(sessionId, result.lastInsertRowid, expiresAt);

    res.setHeader('Set-Cookie', `session=${sessionId}; Path=/; HttpOnly; Max-Age=2592000`);
    res.json({ ok: true, userId: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
