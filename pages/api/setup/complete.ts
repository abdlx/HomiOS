import Database from 'better-sqlite3';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { drives } = req.body;
    const db = new Database('/app/data/filemanager.db');
    
    // In a real app we'd map these to the admin user
    // For now we just mark setup complete in initialized table if needed
    // Assuming setup is already complete from the auth setup, but we'd register drives here
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
    
    const insert = db.prepare('INSERT INTO drives (user_id, mount_path, label) VALUES (1, ?, ?)');
    
    for (const drivePath of drives) {
      const label = drivePath.split('/').pop() || 'Drive';
      insert.run(drivePath, label);
    }
    
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
