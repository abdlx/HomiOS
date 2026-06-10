import { getDb } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';

export default withAuth(async (req, res, session) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { drives } = req.body || {};
    const db = getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS drives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mount_path TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    const insert = db.prepare('INSERT INTO drives (user_id, mount_path, label) VALUES (?, ?, ?)');
    for (const drivePath of drives || []) {
      const label = String(drivePath).split('/').pop() || 'Drive';
      insert.run(session.userId, drivePath, label);
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
